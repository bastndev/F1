import * as vscode from 'vscode';
import { findConfigContentMatches } from './detectors/config-content';
import { getPackageNames, readWorkspacePackageJson } from './detectors/package-json';
import { findSourceExtensions } from './detectors/source-files';
import { findExistingWorkspaceFiles } from './detectors/workspace-files';
import { COMBO_RULES } from './registry/combo-rules';
import { TECHNOLOGY_RULES } from './registry/technology-rules';
import type { DetectedCombo, DetectedTechnology, ProjectAnalysis, ProjectCategory } from './types';

export async function analyzeWorkspaceForRecommendations(): Promise<ProjectAnalysis> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return {
			technologies: [],
			combos: [],
			categories: [],
			workspaceName: 'Workspace',
		};
	}

	const workspaceUri = workspaceFolder.uri;
	const packageJson = await readWorkspacePackageJson(workspaceUri);
	const packageNames = getPackageNames(packageJson);
	const packageNameList = Array.from(packageNames);
	const configFiles = unique(TECHNOLOGY_RULES.flatMap(rule => rule.configFiles ?? []));
	const fileExtensions = unique(TECHNOLOGY_RULES.flatMap(rule => rule.fileExtensions ?? []));
	const contentMatches = TECHNOLOGY_RULES.flatMap(rule => rule.contentMatches ?? []);

	const [existingFiles, existingExtensions, matchedContentFiles] = await Promise.all([
		findExistingWorkspaceFiles(workspaceUri, configFiles),
		findSourceExtensions(workspaceUri, fileExtensions),
		findConfigContentMatches(workspaceUri, contentMatches),
	]);

	const technologies = TECHNOLOGY_RULES
		.map(rule => {
			const sources = getRuleSources(rule, packageNames, packageNameList, existingFiles, existingExtensions, matchedContentFiles);
			if (sources.length === 0) {
				return undefined;
			}

			return {
				id: rule.id,
				name: rule.name,
				categories: rule.categories,
				sources,
				skills: rule.skills,
				searchTerms: rule.searchTerms ?? [rule.name],
			};
		})
		.filter((technology): technology is DetectedTechnology => technology !== undefined);

	const technologyIds = new Set(technologies.map(technology => technology.id));
	const combos = COMBO_RULES
		.filter(rule => rule.requires.every(id => technologyIds.has(id)))
		.map((rule): DetectedCombo => ({
			id: rule.id,
			name: rule.name,
			requires: rule.requires,
			categories: rule.categories,
			skills: rule.skills,
			searchTerms: rule.searchTerms ?? [rule.name],
		}));

	return {
		technologies,
		combos,
		categories: collectCategories(technologies, combos),
		workspaceName: workspaceFolder.name,
	};
}

function getRuleSources(
	rule: typeof TECHNOLOGY_RULES[number],
	packageNames: Set<string>,
	packageNameList: string[],
	existingFiles: Set<string>,
	existingExtensions: Set<string>,
	matchedContentFiles: Set<string>,
): string[] {
	const sources: string[] = [];

	if (rule.packages?.some(packageName => packageNames.has(packageName))) {
		sources.push('package.json');
	}

	if (rule.packagePrefixes?.some(prefix => packageNameList.some(packageName => packageName.startsWith(prefix)))) {
		sources.push('package.json');
	}

	const matchedConfig = rule.configFiles?.find(fileName => existingFiles.has(fileName));
	if (matchedConfig) {
		sources.push(matchedConfig);
	}

	const matchedExtension = rule.fileExtensions?.find(extension => existingExtensions.has(extension.toLowerCase()));
	if (matchedExtension) {
		sources.push(`*${matchedExtension}`);
	}

	const matchedContent = rule.contentMatches
		?.flatMap(match => match.files)
		.find(fileName => matchedContentFiles.has(fileName));
	if (matchedContent) {
		sources.push(matchedContent);
	}

	return unique(sources);
}

function collectCategories(technologies: DetectedTechnology[], combos: DetectedCombo[]): ProjectCategory[] {
	return unique([...technologies, ...combos].flatMap(item => item.categories));
}

function unique<T>(values: readonly T[]): T[] {
	return Array.from(new Set(values));
}
