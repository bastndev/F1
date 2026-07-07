/**
 * Reconciled read of the workspace skills-lock.json.
 *
 * The lock is written by the external `skills` CLI on install and pruned by the
 * UI delete flow, but a skill folder removed by hand (Explorer, terminal) leaves
 * its entry behind — and every reader that trusts the lock alone then treats the
 * skill as still installed, hiding it from the marketplace forever. Reading
 * through here drops entries whose folder no longer holds a SKILL.md under a
 * marketplace root (the same "installed" definition the Local panel uses). The
 * lock file itself is never modified.
 */
import * as vscode from 'vscode';
import { ROOT_SKILL_FOLDERS } from '../../local-skill/core/file-folder/folder-skills';
import type { SkillsLockFile } from './types';

const SKILLS_LOCK_FILE = 'skills-lock.json';
const SKILL_MANIFEST_FILE = 'SKILL.md';

export interface InstalledSkillsLockEntry {
	/** Lock key — the skill name as the `skills` CLI recorded it. */
	name: string;
	/** Repo-relative `<folderName>/…` path, when the entry carries one. */
	skillPath?: string;
}

/** Lock entries whose skill folder still exists under `.agents/skills` or `.claude/skills`. */
export async function readInstalledSkillsLockEntries(workspaceUri: vscode.Uri): Promise<InstalledSkillsLockEntry[]> {
	let parsed: SkillsLockFile;
	try {
		const lockUri = vscode.Uri.joinPath(workspaceUri, SKILLS_LOCK_FILE);
		parsed = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(lockUri))) as SkillsLockFile;
	} catch {
		// A workspace without skills-lock.json simply has no marketplace installs yet.
		return [];
	}

	const rawSkills = parsed.skills;
	if (!rawSkills || typeof rawSkills !== 'object' || Array.isArray(rawSkills)) {
		return [];
	}

	const entries = Object.entries(rawSkills as Record<string, unknown>);
	if (entries.length === 0) {
		return [];
	}

	const onDisk = await listInstalledSkillFolderNames(workspaceUri);
	const reconciled: InstalledSkillsLockEntry[] = [];

	for (const [name, entry] of entries) {
		const rawSkillPath = entry && typeof entry === 'object' ? (entry as { skillPath?: unknown }).skillPath : undefined;
		const skillPath = typeof rawSkillPath === 'string' ? rawSkillPath : undefined;
		// The on-disk folder is named after the lock key, or after the first
		// segment of skillPath — the same convention removeSkillsLockEntry
		// matches on when the UI delete flow prunes the lock.
		const folderName = skillPath?.split('/').find(Boolean) ?? name;
		if (onDisk.has(folderName) || onDisk.has(name)) {
			reconciled.push({ name, skillPath });
		}
	}

	return reconciled;
}

async function listInstalledSkillFolderNames(workspaceUri: vscode.Uri): Promise<Set<string>> {
	const names = new Set<string>();

	for (const folder of ROOT_SKILL_FOLDERS) {
		const folderUri = vscode.Uri.joinPath(workspaceUri, ...folder.split('/'));

		let entries: [string, vscode.FileType][];
		try {
			entries = await vscode.workspace.fs.readDirectory(folderUri);
		} catch {
			// Folder absent — no marketplace skills installed there.
			continue;
		}

		await Promise.all(entries
			.filter(([, type]) => type === vscode.FileType.Directory)
			.map(async ([name]) => {
				if (await hasSkillManifest(vscode.Uri.joinPath(folderUri, name))) {
					names.add(name);
				}
			}));
	}

	return names;
}

async function hasSkillManifest(folderUri: vscode.Uri): Promise<boolean> {
	try {
		const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(folderUri, SKILL_MANIFEST_FILE));
		return stat.type === vscode.FileType.File;
	} catch {
		return false;
	}
}
