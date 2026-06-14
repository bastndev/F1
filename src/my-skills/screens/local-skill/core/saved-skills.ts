import * as vscode from 'vscode';
import type { LocalSkill } from './types';

const SAVED_SKILLS_DIR = 'saved-skills';
const INDEX_FILE = 'saved-skills-index.json';

interface SavedSkillIndexEntry {
	name: string;
	description?: string;
	savedAt: number;
}

interface SavedSkillIndex {
	skills: Record<string, SavedSkillIndexEntry>;
}

function getSavedSkillsDir(globalStorageUri: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(globalStorageUri, SAVED_SKILLS_DIR);
}

function getIndexUri(globalStorageUri: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(globalStorageUri, SAVED_SKILLS_DIR, INDEX_FILE);
}

async function readIndex(globalStorageUri: vscode.Uri): Promise<SavedSkillIndex> {
	try {
		const bytes = await vscode.workspace.fs.readFile(getIndexUri(globalStorageUri));
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SavedSkillIndex;
		return { skills: parsed.skills ?? {} };
	} catch {
		return { skills: {} };
	}
}

async function writeIndex(globalStorageUri: vscode.Uri, index: SavedSkillIndex): Promise<void> {
	const uri = getIndexUri(globalStorageUri);
	const content = `${JSON.stringify(index, null, 2)}\n`;
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}

export async function getSavedSkills(globalStorageUri: vscode.Uri): Promise<LocalSkill[]> {
	const index = await readIndex(globalStorageUri);
	const dir = getSavedSkillsDir(globalStorageUri);

	const checks = Object.entries(index.skills).map(async ([id, entry]): Promise<LocalSkill | undefined> => {
		try {
			const skillUri = vscode.Uri.joinPath(dir, id);
			const stat = await vscode.workspace.fs.stat(skillUri);
			if (stat.type !== vscode.FileType.Directory) {
				return undefined;
			}

			return {
				id,
				name: entry.name,
				description: entry.description,
				source: 'Saved',
				kind: 'folder',
				enabled: false,
				installedAt: entry.savedAt,
			};
		} catch {
			return undefined;
		}
	});

	const results = await Promise.all(checks);
	return results.filter((skill): skill is LocalSkill => Boolean(skill));
}

export async function saveSkill(
	globalStorageUri: vscode.Uri,
	workspaceFolderUri: vscode.Uri,
	skillId: string,
): Promise<void> {
	const parts = skillId.split('/');
	const skillName = parts[parts.length - 1];
	if (!skillName) {
		return;
	}

	const sourceUri = vscode.Uri.joinPath(workspaceFolderUri, ...parts);
	const destUri = vscode.Uri.joinPath(getSavedSkillsDir(globalStorageUri), skillName);

	try {
		await vscode.workspace.fs.stat(sourceUri);
	} catch {
		throw new Error(`Source skill not found: ${skillId}`);
	}

	// Remove existing saved skill with same name
	try {
		await vscode.workspace.fs.delete(destUri, { recursive: true, useTrash: false });
	} catch {
		// ignore if not exists
	}

	// Copy recursively
	await copyDirectory(sourceUri, destUri);

	// Update index
	const index = await readIndex(globalStorageUri);
	index.skills[skillName] = {
		name: skillName,
		savedAt: Date.now(),
	};

	// Try to read description from manifest
	try {
		const manifestUri = vscode.Uri.joinPath(sourceUri, 'SKILL.md');
		const manifestBytes = await vscode.workspace.fs.readFile(manifestUri);
		const manifestRaw = new TextDecoder().decode(manifestBytes);
		const descMatch = manifestRaw.match(/^description\s*:\s*(.+?)\s*$/m);
		if (descMatch) {
			let desc = descMatch[1].trim();
			if ((desc.startsWith('"') && desc.endsWith('"')) || (desc.startsWith("'") && desc.endsWith("'"))) {
				desc = desc.slice(1, -1);
			}
			if (desc.length > 0) {
				index.skills[skillName].description = desc;
			}
		}
	} catch {
		// ignore manifest read errors
	}

	await writeIndex(globalStorageUri, index);
}

export async function deleteSavedSkill(globalStorageUri: vscode.Uri, skillId: string): Promise<void> {
	const dir = getSavedSkillsDir(globalStorageUri);
	const skillUri = vscode.Uri.joinPath(dir, skillId);

	try {
		await vscode.workspace.fs.delete(skillUri, { recursive: true, useTrash: false });
	} catch {
		// ignore if already gone
	}

	const index = await readIndex(globalStorageUri);
	const nextSkills = { ...index.skills };
	delete nextSkills[skillId];
	await writeIndex(globalStorageUri, { skills: nextSkills });
}

export async function enableSavedSkill(
	globalStorageUri: vscode.Uri,
	workspaceFolderUri: vscode.Uri,
	skillId: string,
	target: 'agents' | 'claude',
): Promise<void> {
	const sourceUri = vscode.Uri.joinPath(getSavedSkillsDir(globalStorageUri), skillId);
	const targetFolder = target === 'agents' ? '.agents/skills' : '.claude/skills';
	const destUri = vscode.Uri.joinPath(workspaceFolderUri, ...targetFolder.split('/'), skillId);

	try {
		await vscode.workspace.fs.stat(destUri);
		throw new Error(`Skill '${skillId}' already exists in ${targetFolder}`);
	} catch (err) {
		if (err instanceof Error && err.message.includes('already exists')) {
			throw err;
		}
		// dest doesn't exist, good
	}

	await copyDirectory(sourceUri, destUri);
}

async function copyDirectory(source: vscode.Uri, dest: vscode.Uri): Promise<void> {
	await vscode.workspace.fs.createDirectory(dest);
	const entries = await vscode.workspace.fs.readDirectory(source);

	for (const [name, type] of entries) {
		const sourceChild = vscode.Uri.joinPath(source, name);
		const destChild = vscode.Uri.joinPath(dest, name);
		if (type === vscode.FileType.Directory) {
			await copyDirectory(sourceChild, destChild);
		} else {
			const bytes = await vscode.workspace.fs.readFile(sourceChild);
			await vscode.workspace.fs.writeFile(destChild, bytes);
		}
	}
}

export function isSavedSkillInWorkspace(savedId: string, workspaceSkills: LocalSkill[]): boolean {
	return workspaceSkills.some(skill => skill.kind === 'folder' && skill.id.endsWith(`/${savedId}`));
}
