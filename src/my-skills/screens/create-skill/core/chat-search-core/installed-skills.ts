import * as vscode from 'vscode';
import { getWorkspaceRootSkills } from '../../../local-skill/core/local-skills';
import type { InstalledSkillSnapshot } from './types';

export async function getInstalledSkillSnapshot(): Promise<InstalledSkillSnapshot> {
	const ids = new Set<string>();
	const names = new Set<string>();
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	if (workspaceFolder) {
		await addSkillsLockEntries(workspaceFolder.uri, ids, names);
	}

	const localSkills = await getWorkspaceRootSkills();
	for (const skill of localSkills) {
		add(ids, skill.id);
		add(names, skill.name);
		const parts = skill.id.split('/');
		add(names, parts[parts.length - 1]);
	}

	return { ids, names };
}

export function isSkillInstalled(snapshot: InstalledSkillSnapshot, skillId: string, skillName: string): boolean {
	const normalizedSkillId = normalize(skillId);
	const normalizedSkillName = normalize(skillName);
	const normalizedLastSegment = normalize(lastPathSegment(skillId));

	return snapshot.ids.has(normalizedSkillId)
		|| snapshot.names.has(normalizedSkillName)
		|| snapshot.names.has(normalizedLastSegment);
}

async function addSkillsLockEntries(workspaceUri: vscode.Uri, ids: Set<string>, names: Set<string>): Promise<void> {
	try {
		const lockUri = vscode.Uri.joinPath(workspaceUri, 'skills-lock.json');
		const parsed: unknown = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(lockUri)));

		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return;
		}

		const skills = (parsed as Record<string, unknown>).skills;
		if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
			return;
		}

		for (const [name, entry] of Object.entries(skills as Record<string, unknown>)) {
			add(names, name);
			if (entry && typeof entry === 'object') {
				const skillPath = (entry as { skillPath?: unknown }).skillPath;
				if (typeof skillPath === 'string') {
					add(ids, skillPath);
					add(names, lastPathSegment(skillPath));
				}
			}
		}
	} catch {
		// A workspace without skills-lock.json simply has no marketplace lock entries yet.
	}
}

function lastPathSegment(value: string): string {
	const parts = value.split('/').filter(Boolean);
	return parts[parts.length - 1] ?? value;
}

function add(target: Set<string>, value: string | undefined): void {
	if (!value) {
		return;
	}

	target.add(normalize(value));
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}
