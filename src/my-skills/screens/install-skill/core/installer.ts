import * as vscode from 'vscode';
import { spawn } from 'child_process';
import type { InstallMarketplaceSkill, InstallSkillTarget } from './types';

interface InstallChoice extends vscode.QuickPickItem {
	target: InstallSkillTarget;
	agent: 'codex' | 'claude-code';
}

const MARKETPLACE_SOURCE_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MARKETPLACE_SKILL_ID_PATTERN = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

export async function installMarketplaceSkill(skill: InstallMarketplaceSkill): Promise<boolean> {
	if (!isSafeMarketplaceSkillReference(skill)) {
		void vscode.window.showErrorMessage('[My Skills] Install failed: invalid marketplace skill reference.');
		return false;
	}

	const choice = await pickInstallTarget(skill);
	if (!choice) {
		return false;
	}

	return runSkillsInstall(skill, choice);
}

async function pickInstallTarget(skill: InstallMarketplaceSkill): Promise<InstallChoice | undefined> {
	const choices: InstallChoice[] = [
		{
			label: 'Recommended',
			description: '.agents/skills',
			detail: `Install ${skill.name} for the shared project skills folder`,
			target: 'recommended',
			agent: 'codex',
		},
		{
			label: 'Claude Code',
			description: '.claude/skills',
			detail: `Install ${skill.name} for Claude Code in this project`,
			target: 'claude',
			agent: 'claude-code',
		},
	];

	return vscode.window.showQuickPick(choices, {
		title: `Install ${skill.name}`,
		placeHolder: 'Choose where to install this skill',
	});
}

async function runSkillsInstall(skill: InstallMarketplaceSkill, choice: InstallChoice): Promise<boolean> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceRoot) {
		void vscode.window.showWarningMessage('[My Skills] Open a workspace before installing project skills.');
		return false;
	}

	const args = [
		'-y',
		'skills',
		'add',
		skill.source,
		'--skill',
		skill.skillId,
		'-a',
		choice.agent,
		'-y',
	];

	const env = {
		...process.env,
		DISABLE_TELEMETRY: '1',
		DO_NOT_TRACK: '1',
		SKILLS_NO_TELEMETRY: '1',
	};

	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `[My Skills] Installing ${skill.name}...`,
			cancellable: false,
		},
		() => {
			return new Promise<boolean>(resolve => {
				const child = spawn('npx', args, { cwd: workspaceRoot, shell: false, env });
				let stderr = '';

				child.stderr?.on('data', data => {
					stderr += data.toString();
				});

				child.on('error', error => {
					void vscode.window.showErrorMessage(`[My Skills] Install failed: ${error.message}`);
					resolve(false);
				});

				child.on('close', code => {
					if (code === 0) {
						void vscode.window.showInformationMessage(`[My Skills] ${skill.name} installed ✅.`);
						resolve(true);
						return;
					}

					const detail = stderr.trim();
					void vscode.window.showErrorMessage(
						detail ? `[My Skills] Install failed: ${cleanCliOutput(detail)}` : `[My Skills] Install failed with code ${code}`,
					);
					resolve(false);
				});
			});
		},
	);
}

function isSafeMarketplaceSkillReference(skill: InstallMarketplaceSkill): boolean {
	return MARKETPLACE_SOURCE_PATTERN.test(skill.source)
		&& MARKETPLACE_SKILL_ID_PATTERN.test(skill.skillId);
}

function cleanCliOutput(value: string): string {
	return value
		.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
		.replace(/\[(?:\d{1,3};)*\d{1,3}m/g, '')
		.replace(/\r(?!\n)/g, '\n')
		.split(/\r?\n/g)
		.map(line => line.trim())
		.filter(Boolean)
		.slice(-2)
		.join(' | ');
}
