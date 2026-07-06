import * as vscode from 'vscode';
import { readInstalledSkillsLockEntries } from '../../../install-skill/core/skills-lock';
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
	// Reconciled read: a skill folder deleted by hand must not keep flagging its
	// name as installed in the search recommendations.
	for (const { name, skillPath } of await readInstalledSkillsLockEntries(workspaceUri)) {
		add(names, name);
		if (skillPath) {
			add(ids, skillPath);
			add(names, lastPathSegment(skillPath));
		}
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
