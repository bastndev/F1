import { searchMarketplaceSkills } from '../../../install-skill/core/marketplace';
import * as https from 'https';
import { getProjectAnalysis } from '../shared/project-analyzer';
import { buildCanonicalSearchQuery, buildProjectTechnologyQuery } from './data/categories';

export interface FastContext {
	name: string;
	technologies: string[];
	description: string;
	downloadedSkillsText: string[];
}

let currentContext: FastContext = {
	name: '',
	technologies: [],
	description: '',
	downloadedSkillsText: [],
};

const pendingFetches: Promise<void>[] = [];
const MAX_DOWNLOADED_SKILLS = 2;
const MAX_REFERENCE_MARKDOWN_BYTES = 80_000;
const FETCH_TIMEOUT_MS = 1500;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SKILL_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function getFastContext(): FastContext {
	return currentContext;
}

export function resetFastContext() {
	currentContext = {
		name: '',
		technologies: [],
		description: '',
		downloadedSkillsText: [],
	};
	pendingFetches.length = 0;
}

export function updateFastName(name: string) {
	currentContext.name = name;
	// Do not trigger background download on name anymore, only on category
}

export function updateFastTechnologies(techs: string[]) {
	currentContext.technologies = techs;
	if (techs.length > 0) {
		if (techs.includes('others')) {
			// Trigger fetch based on project compatibility
			const promise = getProjectAnalysis().then(analysis => {
				if (analysis.technologies.length > 0) {
					currentContext.technologies = analysis.technologies.map(t => t.id);
					const topTechnology = analysis.technologies[0];
					const searchQuery = buildProjectTechnologyQuery(topTechnology.id, topTechnology.searchTerms);
					return fetchBackgroundSkill(searchQuery.query);
				}
			});
			pendingFetches.push(promise);
		} else {
			const searchQuery = buildCanonicalSearchQuery({
				categoryId: techs[0],
				subcategoryId: techs[1] ?? null,
				skillName: currentContext.name,
				description: currentContext.description,
			});
			const promise = fetchBackgroundSkill(searchQuery.query);
			pendingFetches.push(promise);
		}
	}
}

export function updateFastDescription(description: string) {
	currentContext.description = description;
}

async function fetchBackgroundSkill(query: string) {
	if (!query.trim() || currentContext.downloadedSkillsText.length >= MAX_DOWNLOADED_SKILLS) {
		return;
	}

	try {
		// 1. Search for a skill
		const results = await searchMarketplaceSkills(query, 3);
		if (results.length === 0) {
			return;
		}

		// Pick the first one
		const skill = results[0];
		if (!GITHUB_REPO_PATTERN.test(skill.source) || !SKILL_ID_PATTERN.test(skill.skillId)) {
			return;
		}
		
		// 2. Fetch the raw markdown from GitHub
		// Source is usually "owner/repo"
		const rawUrlMain = `https://raw.githubusercontent.com/${skill.source}/main/.agents/skills/${skill.skillId}/SKILL.md`;
		const rawUrlMaster = `https://raw.githubusercontent.com/${skill.source}/master/.agents/skills/${skill.skillId}/SKILL.md`;
		const rawUrlNestedMain = `https://raw.githubusercontent.com/${skill.source}/main/.claude/skills/${skill.skillId}/SKILL.md`;
		const rawUrlNestedMaster = `https://raw.githubusercontent.com/${skill.source}/master/.claude/skills/${skill.skillId}/SKILL.md`;

		let markdown = await tryFetchRaw(rawUrlMain);
		if (!markdown) { markdown = await tryFetchRaw(rawUrlMaster); }
		if (!markdown) { markdown = await tryFetchRaw(rawUrlNestedMain); }
		if (!markdown) { markdown = await tryFetchRaw(rawUrlNestedMaster); }

		if (markdown && currentContext.downloadedSkillsText.length < MAX_DOWNLOADED_SKILLS) {
			currentContext.downloadedSkillsText.push(markdown);
		}
	} catch (error) {
		console.warn('[MySkills] Background skill fetch failed:', error);
	}
}

function tryFetchRaw(url: string): Promise<string | null> {
	return new Promise((resolve) => {
		const req = https.get(url, { headers: { 'User-Agent': 'MySkillsExtension/0.1' }, timeout: FETCH_TIMEOUT_MS }, (res) => {
			if (res.statusCode === 200) {
				let data = '';
				let receivedBytes = 0;
				res.on('data', chunk => {
					receivedBytes += Buffer.byteLength(chunk);
					if (receivedBytes > MAX_REFERENCE_MARKDOWN_BYTES) {
						req.destroy();
						resolve(null);
						return;
					}

					data += chunk;
				});
				res.on('end', () => resolve(data));
			} else {
				// Consume response data to free up memory
				res.resume();
				resolve(null);
			}
		});

		req.on('timeout', () => {
			req.destroy();
			resolve(null);
		});
		req.on('error', () => resolve(null));
	});
}

export async function waitForPendingBackgroundFetches(timeoutMs: number = 2000): Promise<void> {
	if (pendingFetches.length === 0) {
		return;
	}

	try {
		const timeoutPromise = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
		await Promise.race([Promise.all(pendingFetches), timeoutPromise]);
	} catch {
		// Ignore timeout or fetch errors, we just proceed with whatever we got
	} finally {
		// Clear pending fetches
		pendingFetches.length = 0;
	}
}
