import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import type { InstallMarketplaceSkill, InstallSkillTarget } from './types';

const activeInstalls = new Map<string, ChildProcess>();

interface InstallChoice extends vscode.QuickPickItem {
	target: InstallSkillTarget;
	agent: 'codex' | 'claude-code';
}

const MARKETPLACE_SOURCE_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MARKETPLACE_SKILL_ID_PATTERN = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

// Installs of skills owned by these accounts report telemetry so they count on skills.sh.
// Every other source stays opt-out (telemetry disabled).
const TELEMETRY_REPORTING_OWNERS = new Set(['bastndev']);

export async function installMarketplaceSkill(
	skill: InstallMarketplaceSkill,
	signal?: AbortSignal,
	onDownloadStart?: () => void,
): Promise<boolean> {
	if (signal?.aborted) {
		return false;
	}

	if (!isSafeMarketplaceSkillReference(skill)) {
		if (!signal?.aborted) {
			void vscode.window.showErrorMessage(vscode.l10n.t('[My Skills] Install failed: invalid marketplace skill reference.'));
		}
		return false;
	}

	const choice = await pickInstallTarget(skill, signal);
	if (!choice || signal?.aborted) {
		return false;
	}

	return runSkillsInstall(skill, choice, signal, onDownloadStart);
}

export function cancelInstallMarketplaceSkill(id: string): void {
	const child = activeInstalls.get(id);
	if (child) {
		child.kill();
		activeInstalls.delete(id);
	}
}

async function pickInstallTarget(skill: InstallMarketplaceSkill, signal?: AbortSignal): Promise<InstallChoice | undefined> {
	const quickPick = vscode.window.createQuickPick<InstallChoice>();
	quickPick.title = `Install ${skill.name}`;
	quickPick.placeholder = 'Choose where to install this skill';
	quickPick.items = [
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

	return new Promise(resolve => {
		let resolved = false;

		const finish = (value: InstallChoice | undefined) => {
			if (resolved) {
				return;
			}
			resolved = true;
			signal?.removeEventListener('abort', onAbort);
			quickPick.dispose();
			resolve(value);
		};

		const onAbort = () => {
			quickPick.hide();
		};

		if (signal?.aborted) {
			finish(undefined);
			return;
		}

		signal?.addEventListener('abort', onAbort, { once: true });

		quickPick.onDidAccept(() => {
			finish(quickPick.selectedItems[0]);
		});

		quickPick.onDidHide(() => {
			finish(signal?.aborted ? undefined : quickPick.selectedItems[0]);
		});

		quickPick.show();
	});
}

async function runSkillsInstall(skill: InstallMarketplaceSkill, choice: InstallChoice, signal?: AbortSignal, onDownloadStart?: () => void): Promise<boolean> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceRoot) {
		if (!signal?.aborted) {
			void vscode.window.showWarningMessage(vscode.l10n.t('[My Skills] Open a workspace before installing project skills.'));
		}
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

	// Only owners we publish (e.g. bastndev) report installs so they count on skills.sh.
	// All other sources keep telemetry disabled.
	const env = shouldReportInstall(skill)
		? { ...process.env }
		: {
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
				if (signal?.aborted) {
					resolve(false);
					return;
				}

				onDownloadStart?.();

				const child = spawn('npx', args, { cwd: workspaceRoot, shell: false, env });
				activeInstalls.set(skill.id, child);
				let stderr = '';

				const cleanup = () => {
					signal?.removeEventListener('abort', onAbort);
					activeInstalls.delete(skill.id);
				};

				const onAbort = () => {
					child.kill();
				};

				signal?.addEventListener('abort', onAbort, { once: true });

				child.stderr?.on('data', data => {
					stderr += data.toString();
				});

				child.on('error', error => {
					cleanup();
					if (!signal?.aborted) {
						void vscode.window.showErrorMessage(vscode.l10n.t('[My Skills] Install failed: {0}', error.message));
					}
					resolve(false);
				});

				child.on('close', code => {
					cleanup();
					if (child.killed || signal?.aborted) {
						resolve(false);
						return;
					}

					if (code === 0) {
						void vscode.window.showInformationMessage(vscode.l10n.t('Skill [{0}] installed ✅', skill.name));
						resolve(true);
						return;
					}

					const detail = stderr.trim();
					void vscode.window.showErrorMessage(
						detail
							? vscode.l10n.t('[My Skills] Install failed: {0}', cleanCliOutput(detail))
							: vscode.l10n.t('[My Skills] Install failed with code {0}', String(code)),
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

function shouldReportInstall(skill: InstallMarketplaceSkill): boolean {
	const owner = skill.source.split('/')[0]?.trim().toLowerCase();
	return owner ? TELEMETRY_REPORTING_OWNERS.has(owner) : false;
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
