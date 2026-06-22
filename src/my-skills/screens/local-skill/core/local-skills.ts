import * as vscode from 'vscode';
import { ROOT_SKILL_FILES, ROOT_SKILL_FILE_ICON, ROOT_SKILL_FILE_NAMES } from './file-folder/file-skills';
import { ROOT_SKILL_FOLDERS, ROOT_SKILL_FOLDER_WATCH_PATTERNS } from './file-folder/folder-skills';
import { readSkillManifestMetadata } from './skill-manifest';
import type { LocalSkill } from './types';

export { ROOT_SKILL_FILE_NAMES };
export { ROOT_SKILL_FOLDER_WATCH_PATTERNS };
const GITIGNORE_FILE = '.gitignore';
const SKILLS_LOCK_FILE = 'skills-lock.json';
const BLOCK_BEGIN = '# My Skills: begin';
const BLOCK_END = '# My Skills: end';
const SKILL_MANIFEST_FILE = 'SKILL.md';
const SKILL_FOLDER_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BROAD_IGNORE_FOLDERS = ['.claude/', '.agents/'] as const;
const BROAD_IGNORE_LOCK_ENTRY = 'skills-lock.json';
const BROAD_IGNORE_ENTRIES: readonly string[] = [...BROAD_IGNORE_FOLDERS, BROAD_IGNORE_LOCK_ENTRY];

interface GitignoreBlock {
	lines: string[];
	startIndex: number;
	endIndex: number;
}

interface GitignoreText {
	content: string;
	eol: '\n' | '\r\n';
}

interface SkillsLockFile {
	version?: number;
	skills?: Record<string, { skillPath?: string } | unknown>;
}

export async function getWorkspaceRootSkills(): Promise<LocalSkill[]> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return [];
	}

	const disabledSkills = await getDisabledSkillIds(workspaceFolder.uri);
	const fileChecks = ROOT_SKILL_FILES.map(async (fileName): Promise<LocalSkill | undefined> => {
		const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);

		try {
			const stat = await vscode.workspace.fs.stat(uri);
			if (stat.type !== vscode.FileType.File) {
				return undefined;
			}

			return {
				id: fileName,
				name: fileName,
				source: workspaceFolder.name,
				kind: 'file',
				icon: ROOT_SKILL_FILE_ICON,
				enabled: !disabledSkills.has(fileName),
				installedAt: stat.mtime,
			};
		} catch {
			return undefined;
		}
	});
	const folderChecks = ROOT_SKILL_FOLDERS.map(folder => getWorkspaceFolderSkills(workspaceFolder, folder, disabledSkills));

	const [fileResults, folderResults] = await Promise.all([
		Promise.all(fileChecks),
		Promise.all(folderChecks),
	]);

	return [
		...fileResults.filter((skill): skill is LocalSkill => Boolean(skill)),
		...folderResults.flat(),
	];
}

export async function setWorkspaceRootSkillEnabled(skillId: string, enabled: boolean): Promise<void> {
	if (!isSupportedSkillId(skillId)) {
		return;
	}

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return;
	}

	const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, GITIGNORE_FILE);
	const text = await readGitignoreText(gitignoreUri);

	let nextContent: string;

	if (isRootSkillFolder(skillId) && !enabled) {
		const folderCount = await getInstalledFolderSkillCount(workspaceFolder.uri);
		nextContent = folderCount <= 1
			? writeBroadGitignoreBlock(text.content, text.eol)
			: updateGitignoreSkillState(text.content, skillId, enabled, text.eol);
	} else if (isRootSkillFolder(skillId) && enabled) {
		nextContent = await enableFolderSkillContent(text.content, skillId, workspaceFolder.uri, text.eol);
	} else {
		nextContent = updateGitignoreSkillState(text.content, skillId, enabled, text.eol);
	}

	if (nextContent === text.content) {
		return;
	}

	await vscode.workspace.fs.writeFile(gitignoreUri, new TextEncoder().encode(nextContent));
}

export async function deleteWorkspaceRootSkill(skillId: string): Promise<void> {
	if (!isSupportedSkillId(skillId)) {
		return;
	}

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return;
	}

	const targetUri = getWorkspaceSkillUri(workspaceFolder.uri, skillId);
	const stat = await vscode.workspace.fs.stat(targetUri);
	await vscode.workspace.fs.delete(targetUri, {
		recursive: stat.type === vscode.FileType.Directory,
		useTrash: true,
	});
	await removeWorkspaceRootSkillState(workspaceFolder.uri, skillId);
	if (isRootSkillFolder(skillId)) {
		await removeSkillsLockEntry(workspaceFolder.uri, skillId);
		await pruneEmptySkillContainers(workspaceFolder.uri, skillId);
		await deleteSkillsLockIfEmpty(workspaceFolder.uri);
	}
}

async function pruneEmptySkillContainers(workspaceUri: vscode.Uri, skillId: string): Promise<void> {
	const folder = ROOT_SKILL_FOLDERS.find(candidate => skillId.startsWith(`${candidate}/`));
	if (!folder) {
		return;
	}

	const segments = folder.split('/');
	for (let depth = segments.length; depth > 0; depth--) {
		const slice = segments.slice(0, depth);
		const dirUri = vscode.Uri.joinPath(workspaceUri, ...slice);
		if (!(await isDirectoryEmpty(dirUri))) {
			return;
		}

		try {
			await vscode.workspace.fs.delete(dirUri, { recursive: false, useTrash: true });
		} catch {
			return;
		}
	}
}

async function isDirectoryEmpty(uri: vscode.Uri): Promise<boolean> {
	try {
		const entries = await vscode.workspace.fs.readDirectory(uri);
		return entries.length === 0;
	} catch {
		return false;
	}
}

async function getInstalledFolderSkillCount(workspaceUri: vscode.Uri): Promise<number> {
	let count = 0;
	for (const folder of ROOT_SKILL_FOLDERS) {
		const folderUri = vscode.Uri.joinPath(workspaceUri, ...folder.split('/'));
		try {
			const entries = await vscode.workspace.fs.readDirectory(folderUri);
			for (const [name, type] of entries) {
				if (type !== vscode.FileType.Directory || !isValidSkillFolderName(name)) {
					continue;
				}
				if (await hasSkillManifest(vscode.Uri.joinPath(folderUri, name))) {
					count++;
				}
			}
		} catch {
			// ignore — folder may not exist
		}
	}
	return count;
}

async function getOtherInstalledFolderSkills(workspaceUri: vscode.Uri, excludeSkillId: string): Promise<string[]> {
	const result: string[] = [];
	for (const folder of ROOT_SKILL_FOLDERS) {
		const folderUri = vscode.Uri.joinPath(workspaceUri, ...folder.split('/'));
		try {
			const entries = await vscode.workspace.fs.readDirectory(folderUri);
			for (const [name, type] of entries) {
				if (type !== vscode.FileType.Directory || !isValidSkillFolderName(name)) {
					continue;
				}
				const id = `${folder}/${name}`;
				if (id === excludeSkillId) {
					continue;
				}
				if (await hasSkillManifest(vscode.Uri.joinPath(folderUri, name))) {
					result.push(id);
				}
			}
		} catch {
			// ignore — folder may not exist
		}
	}
	return result;
}

function writeBroadGitignoreBlock(content: string, eol: '\n' | '\r\n'): string {
	const normalizedContent = normalizeLineEndings(content);
	const block = findGitignoreBlock(normalizedContent);
	const broadLines = [...BROAD_IGNORE_ENTRIES];

	if (!block) {
		const prefix = normalizedContent.trim().length === 0
			? ''
			: normalizedContent.endsWith('\n\n') ? normalizedContent
			: normalizedContent.endsWith('\n') ? `${normalizedContent}\n`
			: `${normalizedContent}\n\n`;
		return withLineEndings(`${prefix}${BLOCK_BEGIN}\n${broadLines.join('\n')}\n${BLOCK_END}\n`, eol);
	}

	const allLines = splitLines(normalizedContent);
	allLines.splice(block.startIndex + 1, block.lines.length, ...broadLines);
	return withLineEndings(formatManagedBlockSpacing(allLines).join('\n'), eol);
}

async function enableFolderSkillContent(content: string, skillId: string, workspaceUri: vscode.Uri, eol: '\n' | '\r\n'): Promise<string> {
	const normalizedContent = normalizeLineEndings(content);
	const block = findGitignoreBlock(normalizedContent);
	if (!block) {
		return updateGitignoreSkillState(content, skillId, true, eol);
	}

	const broadSet = new Set<string>(BROAD_IGNORE_ENTRIES);
	const hasBroad = block.lines.some(line => broadSet.has(line.trim()));
	if (!hasBroad) {
		return updateGitignoreSkillState(content, skillId, true, eol);
	}

	const others = await getOtherInstalledFolderSkills(workspaceUri, skillId);
	const nextLines: string[] = [];
	for (const line of block.lines) {
		const trimmed = line.trim();
		if (broadSet.has(trimmed)) {
			continue;
		}
		const parsed = parseManagedSkillLine(line);
		if (parsed?.skillId === skillId) {
			continue;
		}
		nextLines.push(line);
	}

	for (const otherId of others) {
		if (!nextLines.some(line => parseManagedSkillLine(line)?.skillId === otherId)) {
			nextLines.push(otherId);
		}
	}

	nextLines.push(`# ${skillId}`);

	const allLines = splitLines(normalizedContent);
	allLines.splice(block.startIndex + 1, block.lines.length, ...nextLines);
	return withLineEndings(formatManagedBlockSpacing(allLines).join('\n'), eol);
}

async function deleteSkillsLockIfEmpty(workspaceUri: vscode.Uri): Promise<void> {
	const lockUri = vscode.Uri.joinPath(workspaceUri, SKILLS_LOCK_FILE);
	let parsed: SkillsLockFile;

	try {
		const bytes = await vscode.workspace.fs.readFile(lockUri);
		parsed = JSON.parse(new TextDecoder().decode(bytes)) as SkillsLockFile;
	} catch {
		return;
	}

	if (parsed.skills && typeof parsed.skills === 'object' && Object.keys(parsed.skills).length > 0) {
		return;
	}

	try {
		await vscode.workspace.fs.delete(lockUri, { recursive: false, useTrash: true });
	} catch {
		// ignore — lock file may already be gone
	}
}

async function getWorkspaceFolderSkills(
	workspaceFolder: vscode.WorkspaceFolder,
	folder: typeof ROOT_SKILL_FOLDERS[number],
	disabledSkills: Set<string>,
): Promise<LocalSkill[]> {
	const folderUri = vscode.Uri.joinPath(workspaceFolder.uri, ...folder.split('/'));

	try {
		const entries = await vscode.workspace.fs.readDirectory(folderUri);
		const checks = entries
			.filter(([name, type]) => type === vscode.FileType.Directory && isValidSkillFolderName(name))
			.map(async ([name]): Promise<LocalSkill | undefined> => {
				const id = `${folder}/${name}`;
				const uri = vscode.Uri.joinPath(folderUri, name);

				try {
					const [stat, hasManifest, manifest] = await Promise.all([
						vscode.workspace.fs.stat(uri),
						hasSkillManifest(uri),
						readSkillManifestMetadata(uri),
					]);
					if (!hasManifest) {
						return undefined;
					}

					return {
						id,
						name: manifest.name ?? name,
						description: manifest.description,
						source: `${workspaceFolder.name}/${folder}`,
						kind: 'folder',
						enabled: !disabledSkills.has(id),
						installedAt: stat.mtime,
					};
				} catch {
					return undefined;
				}
			});
		const results = await Promise.all(checks);
		return results.filter((skill): skill is LocalSkill => Boolean(skill));
	} catch {
		return [];
	}
}

async function hasSkillManifest(folderUri: vscode.Uri): Promise<boolean> {
	try {
		const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(folderUri, SKILL_MANIFEST_FILE));
		return stat.type === vscode.FileType.File;
	} catch {
		return false;
	}
}

async function getDisabledSkillIds(workspaceUri: vscode.Uri): Promise<Set<string>> {
	const text = await readGitignoreText(vscode.Uri.joinPath(workspaceUri, GITIGNORE_FILE));
	const block = findGitignoreBlock(text.content);
	const disabled = new Set<string>();

	if (!block) {
		return disabled;
	}

	const broadFolders: string[] = [];
	for (const line of block.lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		if ((BROAD_IGNORE_FOLDERS as readonly string[]).includes(trimmed)) {
			broadFolders.push(trimmed.replace(/\/$/, ''));
			continue;
		}

		const parsed = parseManagedSkillLine(line);
		if (parsed && !parsed.commented) {
			disabled.add(parsed.skillId);
		}
	}

	for (const base of broadFolders) {
		for (const folder of ROOT_SKILL_FOLDERS) {
			if (!folder.startsWith(`${base}/`)) {
				continue;
			}
			const folderUri = vscode.Uri.joinPath(workspaceUri, ...folder.split('/'));
			try {
				const entries = await vscode.workspace.fs.readDirectory(folderUri);
				for (const [name, type] of entries) {
					if (type === vscode.FileType.Directory && isValidSkillFolderName(name)) {
						disabled.add(`${folder}/${name}`);
					}
				}
			} catch {
				// ignore — folder may not exist
			}
		}
	}

	return disabled;
}

function updateGitignoreSkillState(content: string, skillId: string, enabled: boolean, eol: '\n' | '\r\n'): string {
	const normalizedContent = normalizeLineEndings(content);
	const block = findGitignoreBlock(normalizedContent);

	if (!block) {
		if (enabled) {
			return normalizedContent;
		}

		return withLineEndings(appendManagedBlock(normalizedContent, skillId), eol);
	}

	const nextLines = [...block.lines];
	const existingIndex = nextLines.findIndex(line => parseManagedSkillLine(line)?.skillId === skillId);
	const nextLine = enabled ? `# ${skillId}` : skillId;

	if (existingIndex === -1) {
		nextLines.push(nextLine);
	} else {
		nextLines[existingIndex] = nextLine;
	}

	const allLines = splitLines(normalizedContent);
	allLines.splice(block.startIndex + 1, block.lines.length, ...nextLines);
	return withLineEndings(formatManagedBlockSpacing(allLines).join('\n'), eol);
}

async function removeWorkspaceRootSkillState(workspaceUri: vscode.Uri, skillId: string): Promise<void> {
	const gitignoreUri = vscode.Uri.joinPath(workspaceUri, GITIGNORE_FILE);
	const text = await readGitignoreText(gitignoreUri);
	const nextContent = removeGitignoreSkillState(text.content, skillId, text.eol);

	if (nextContent === text.content) {
		return;
	}

	await vscode.workspace.fs.writeFile(gitignoreUri, new TextEncoder().encode(nextContent));
}

async function removeSkillsLockEntry(workspaceUri: vscode.Uri, skillId: string): Promise<void> {
	const skillName = getSkillNameFromId(skillId);
	if (!skillName) {
		return;
	}

	const lockUri = vscode.Uri.joinPath(workspaceUri, SKILLS_LOCK_FILE);
	let parsed: SkillsLockFile;

	try {
		const bytes = await vscode.workspace.fs.readFile(lockUri);
		parsed = JSON.parse(new TextDecoder().decode(bytes)) as SkillsLockFile;
	} catch {
		return;
	}

	if (!parsed.skills || typeof parsed.skills !== 'object') {
		return;
	}

	const nextSkills = { ...parsed.skills };
	let changed = false;

	for (const [entryName, entry] of Object.entries(parsed.skills)) {
		if (entryName === skillName || lockEntryMatchesSkillName(entry, skillName)) {
			delete nextSkills[entryName];
			changed = true;
		}
	}

	if (!changed) {
		return;
	}

	const nextLock: SkillsLockFile = {
		...parsed,
		skills: nextSkills,
	};
	await vscode.workspace.fs.writeFile(lockUri, new TextEncoder().encode(`${JSON.stringify(nextLock, null, 2)}\n`));
}

function removeGitignoreSkillState(content: string, skillId: string, eol: '\n' | '\r\n'): string {
	const normalizedContent = normalizeLineEndings(content);
	const block = findGitignoreBlock(normalizedContent);
	if (!block) {
		return normalizedContent;
	}

	const nextLines = block.lines.filter(line => parseManagedSkillLine(line)?.skillId !== skillId);
	const allLines = splitLines(normalizedContent);

	if (nextLines.some(line => parseManagedSkillLine(line))) {
		allLines.splice(block.startIndex + 1, block.lines.length, ...nextLines);
	} else {
		let removeStart = block.startIndex;
		let removeCount = block.endIndex - block.startIndex + 1;
		if (removeStart > 0 && allLines[removeStart - 1] === '') {
			removeStart--;
			removeCount++;
		}
		allLines.splice(removeStart, removeCount);
	}

	return withLineEndings(formatManagedBlockSpacing(allLines).join('\n'), eol);
}

function appendManagedBlock(content: string, skillId: string): string {
	const prefix = content.trim().length === 0
		? ''
		: content.endsWith('\n\n') ? content : content.endsWith('\n') ? `${content}\n` : `${content}\n\n`;

	return `${prefix}${BLOCK_BEGIN}\n${skillId}\n${BLOCK_END}\n`;
}

function findGitignoreBlock(content: string): GitignoreBlock | undefined {
	const lines = splitLines(content);
	const startIndex = lines.findIndex(line => line.trim() === BLOCK_BEGIN);
	if (startIndex === -1) {
		return undefined;
	}

	const endIndex = lines.findIndex((line, index) => index > startIndex && line.trim() === BLOCK_END);
	if (endIndex === -1) {
		return undefined;
	}

	return {
		lines: lines.slice(startIndex + 1, endIndex),
		startIndex,
		endIndex,
	};
}

function parseManagedSkillLine(line: string): { skillId: string; commented: boolean } | undefined {
	const trimmed = line.trim();
	const commented = trimmed.startsWith('#');
	const candidate = commented ? trimmed.slice(1).trim() : trimmed;

	if (!isSupportedSkillId(candidate)) {
		return undefined;
	}

	return { skillId: candidate, commented };
}

async function readGitignoreText(uri: vscode.Uri): Promise<GitignoreText> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		const content = new TextDecoder().decode(bytes);
		return {
			content,
			eol: content.includes('\r\n') ? '\r\n' : '\n',
		};
	} catch {
		return { content: '', eol: '\n' };
	}
}

function splitLines(content: string): string[] {
	const normalizedContent = normalizeLineEndings(content);
	if (normalizedContent.length === 0) {
		return [];
	}

	return normalizedContent.replace(/\n$/, '').split('\n');
}

function normalizeLineEndings(content: string): string {
	return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function withLineEndings(content: string, eol: '\n' | '\r\n'): string {
	return eol === '\n' ? content : content.replace(/\n/g, eol);
}

function formatManagedBlockSpacing(lines: string[]): string[] {
	const startIndex = lines.findIndex(line => line.trim() === BLOCK_BEGIN);
	if (startIndex === -1) {
		const trimmed = [...lines];
		while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
			trimmed.pop();
		}
		return trimmed.length === 0 ? [''] : [...trimmed, ''];
	}

	const nextLines = [...lines];
	if (startIndex > 0 && nextLines[startIndex - 1] !== '') {
		nextLines.splice(startIndex, 0, '');
	}

	const adjustedStartIndex = nextLines.findIndex(line => line.trim() === BLOCK_BEGIN);
	const endIndex = nextLines.findIndex((line, index) => index > adjustedStartIndex && line.trim() === BLOCK_END);
	if (endIndex !== -1 && nextLines[endIndex + 1] !== '') {
		nextLines.splice(endIndex + 1, 0, '');
	}

	while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
		nextLines.pop();
	}

	return [...nextLines, ''];
}

function isRootSkillFile(value: string): value is typeof ROOT_SKILL_FILES[number] {
	return ROOT_SKILL_FILES.some(fileName => fileName === value);
}

function isRootSkillFolder(value: string): boolean {
	return ROOT_SKILL_FOLDERS.some(folder => {
		if (!value.startsWith(`${folder}/`)) {
			return false;
		}

		const folderName = value.slice(folder.length + 1);
		return isValidSkillFolderName(folderName);
	});
}

function isValidSkillFolderName(value: string): boolean {
	return SKILL_FOLDER_NAME_PATTERN.test(value);
}

function getWorkspaceSkillUri(workspaceUri: vscode.Uri, skillId: string): vscode.Uri {
	return vscode.Uri.joinPath(workspaceUri, ...skillId.split('/'));
}

function isSupportedSkillId(value: string): boolean {
	return isRootSkillFile(value) || isRootSkillFolder(value);
}

function getSkillNameFromId(skillId: string): string | undefined {
	const parts = skillId.split('/');
	return parts[parts.length - 1];
}

function lockEntryMatchesSkillName(entry: unknown, skillName: string): boolean {
	if (!entry || typeof entry !== 'object') {
		return false;
	}

	const skillPath = (entry as { skillPath?: unknown }).skillPath;
	return typeof skillPath === 'string' && skillPath.startsWith(`${skillName}/`);
}
