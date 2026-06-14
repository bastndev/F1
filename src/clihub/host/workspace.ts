/**
 * Workspace queries the prompt modal needs: the @-mention file list and the
 * skills installed under .agents/skills / .claude/skills. Both answer an
 * id-tagged request from the webview (see shared/protocol.ts).
 */
import * as path from 'path';
import * as vscode from 'vscode';
import type { SkillRoot, WorkspaceSkill } from '../shared/prompt';
import type { InboundWebviewMessage } from '../shared/protocol';

type GitignoreRule = {
	negated: boolean;
	directoryOnly: boolean;
	anchored: boolean;
	hasSlash: boolean;
	regexSource: string;
	segmentRegex?: RegExp;
};

const visibleRootDotfiles = new Set([
	'.babelrc',
	'.browserslistrc',
	'.dockerignore',
	'.editorconfig',
	'.env.example',
	'.env.local.example',
	'.eslintignore',
	'.eslintrc',
	'.eslintrc.cjs',
	'.eslintrc.js',
	'.eslintrc.json',
	'.gitattributes',
	'.gitignore',
	'.npmignore',
	'.npmrc',
	'.prettierignore',
	'.prettierrc',
	'.prettierrc.cjs',
	'.prettierrc.js',
	'.prettierrc.json',
	'.stylelintignore',
	'.stylelintrc',
	'.vscodeignore',
]);

export const handleWorkspaceListSkills = async (webview: vscode.Webview, message: InboundWebviewMessage) => {
	if (typeof message.id !== 'string') {
		return;
	}

	// A skill is a directory under one of these roots containing a SKILL.md.
	// Duplicated names collapse into one entry that remembers every root it
	// lives in, so the webview can resolve the right copy per active CLI.
	const skillRoots: Array<{ id: SkillRoot; rel: string }> = [
		{ id: 'agents', rel: '.agents/skills' },
		{ id: 'claude', rel: '.claude/skills' },
	];
	const rootsByName = new Map<string, SkillRoot[]>();
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	if (workspaceFolder) {
		for (const root of skillRoots) {
			const rootUri = vscode.Uri.joinPath(workspaceFolder.uri, ...root.rel.split('/'));
			let entries: Array<[string, vscode.FileType]>;
			try {
				entries = await vscode.workspace.fs.readDirectory(rootUri);
			} catch {
				continue; // root doesn't exist — normal
			}

			const checks = entries
				.filter(([name, type]) => type === vscode.FileType.Directory && !name.startsWith('.'))
				.map(async ([name]) => {
					try {
						const manifest = vscode.Uri.joinPath(rootUri, name, 'SKILL.md');
						const stat = await vscode.workspace.fs.stat(manifest);
						return stat.type === vscode.FileType.File ? name : undefined;
					} catch {
						return undefined;
					}
				});

			for (const name of await Promise.all(checks)) {
				if (name) {
					rootsByName.set(name, [...(rootsByName.get(name) ?? []), root.id]);
				}
			}
		}
	}

	const skills: WorkspaceSkill[] = [...rootsByName.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, roots]) => ({ name, roots }));

	await webview.postMessage({
		type: 'workspace.skills',
		id: message.id,
		skills,
	});
};

export const handleWorkspaceListFiles = async (webview: vscode.Webview, message: InboundWebviewMessage) => {
	if (typeof message.id !== 'string') {
		return;
	}

	try {
		// Find files excluding common ignored directories
		const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}', 1000);
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const gitignoreRules = await getWorkspaceGitignoreRules(workspaceFolder);

		const files = uris.map(uri => {
			const isDirectory = false; // findFiles only returns files
			const name = path.basename(uri.fsPath);
			// Get relative path if within workspace, else use full fsPath
			let relativePath = uri.fsPath;
			if (workspaceFolder && uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
				relativePath = uri.fsPath.substring(workspaceFolder.uri.fsPath.length + 1);
				// Replace backslashes with forward slashes for consistency
				relativePath = relativePath.replace(/\\/g, '/');
			}

			return {
				name,
				path: relativePath,
				displayPath: getMentionDisplayPath(relativePath),
				isDirectory
			};
		}).filter(entry => isMentionVisiblePath(entry.path) && !isGitignoredPath(entry.path, entry.isDirectory, gitignoreRules));

		// If we also want directories, we could get unique directory paths from the files list
		const dirs = new Set<string>();
		files.forEach(f => {
			const dirPath = path.dirname(f.path);
			if (dirPath !== '.') {
				// Add all parent directories
				let current = dirPath;
				while (current !== '.' && current !== '') {
					dirs.add(current);
					current = path.dirname(current);
				}
			}
		});

		const allEntries = [...files];
		dirs.forEach(dir => {
			if (isGitignoredPath(dir, true, gitignoreRules)) {
				return;
			}

			allEntries.push({
				name: path.basename(dir),
				path: dir,
				displayPath: getMentionDisplayPath(dir),
				isDirectory: true
			});
		});

		await webview.postMessage({
			type: 'workspace.files',
			id: message.id,
			files: allEntries
		});
	} catch (error) {
		console.error('Error listing workspace files:', error);
		await webview.postMessage({
			type: 'workspace.files',
			id: message.id,
			files: [] // Return empty on error
		});
	}
};

function isMentionVisiblePath(relativePath: string): boolean {
	const segments = relativePath.split('/').filter(Boolean);
	if (segments.length === 0) {
		return false;
	}

	return segments.every((segment, index) => {
		if (!segment.startsWith('.')) {
			return true;
		}

		return index === segments.length - 1 && visibleRootDotfiles.has(segment);
	});
}

async function getWorkspaceGitignoreRules(workspaceFolder: vscode.WorkspaceFolder | undefined): Promise<GitignoreRule[]> {
	if (!workspaceFolder) {
		return [];
	}

	try {
		const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
		const content = Buffer.from(await vscode.workspace.fs.readFile(gitignoreUri)).toString('utf8');
		return parseGitignoreRules(content);
	} catch {
		return [];
	}
}

function parseGitignoreRules(content: string): GitignoreRule[] {
	return content
		.split(/\r?\n/)
		.map(parseGitignoreRule)
		.filter((rule): rule is GitignoreRule => Boolean(rule));
}

function parseGitignoreRule(line: string): GitignoreRule | undefined {
	let pattern = line.replace(/\s+$/, '');
	if (!pattern) {
		return undefined;
	}

	if (pattern.startsWith('\\#')) {
		pattern = pattern.slice(1);
	} else if (pattern.startsWith('#')) {
		return undefined;
	}

	let negated = false;
	if (pattern.startsWith('\\!')) {
		pattern = pattern.slice(1);
	} else if (pattern.startsWith('!')) {
		negated = true;
		pattern = pattern.slice(1);
	}

	const anchored = pattern.startsWith('/');
	pattern = pattern.replace(/^\/+/, '');

	const directoryOnly = pattern.endsWith('/');
	pattern = pattern.replace(/\/+$/, '');
	if (!pattern) {
		return undefined;
	}

	const hasSlash = pattern.includes('/');
	const regexSource = gitignoreGlobToRegexSource(pattern);

	return {
		negated,
		directoryOnly,
		anchored,
		hasSlash,
		regexSource,
		segmentRegex: hasSlash ? undefined : new RegExp(`^${regexSource}$`),
	};
}

function isGitignoredPath(relativePath: string, isDirectory: boolean, rules: GitignoreRule[]): boolean {
	if (rules.length === 0) {
		return false;
	}

	const normalizedPath = normalizeRelativePath(relativePath);
	if (!normalizedPath) {
		return false;
	}

	let ignored = false;
	for (const rule of rules) {
		if (matchesGitignoreRule(rule, normalizedPath, isDirectory)) {
			ignored = !rule.negated;
		}
	}

	return ignored;
}

function matchesGitignoreRule(rule: GitignoreRule, relativePath: string, isDirectory: boolean): boolean {
	if (!rule.hasSlash && rule.segmentRegex) {
		const segments = relativePath.split('/').filter(Boolean);
		if (rule.anchored) {
			const [rootSegment] = segments;
			if (!rootSegment || !rule.segmentRegex.test(rootSegment)) {
				return false;
			}

			if (!rule.directoryOnly) {
				return true;
			}

			return isDirectory || segments.length > 1;
		}

		return segments.some((segment, index) => {
			if (!rule.segmentRegex?.test(segment)) {
				return false;
			}

			if (!rule.directoryOnly) {
				return true;
			}

			return isDirectory || index < segments.length - 1;
		});
	}

	const matchPrefix = rule.anchored ? '^' : '(?:^|/)';
	return new RegExp(`${matchPrefix}${rule.regexSource}(?:/.*)?$`).test(relativePath);
}

function normalizeRelativePath(relativePath: string): string {
	return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function gitignoreGlobToRegexSource(pattern: string): string {
	let source = '';

	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];

		if (char === '*') {
			const isDoubleStar = pattern[index + 1] === '*';
			if (isDoubleStar) {
				const consumesSlash = pattern[index + 2] === '/';
				source += consumesSlash ? '(?:.*\\/)?' : '.*';
				index += consumesSlash ? 2 : 1;
			} else {
				source += '[^/]*';
			}
			continue;
		}

		if (char === '?') {
			source += '[^/]';
			continue;
		}

		source += escapeRegexChar(char);
	}

	return source;
}

function escapeRegexChar(char: string): string {
	return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
}

function getMentionDisplayPath(relativePath: string): string {
	return `~/${path.basename(relativePath)}`;
}
