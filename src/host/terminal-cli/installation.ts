import * as childProcess from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import type { CliAgent } from '../../shared/agents';
import { getCliInstaller, type CliInstaller } from './cli-installers';
import { uiStrings } from '../../shared/ui-strings';

const installAction = uiStrings.install.installAction;
const cancelAction = uiStrings.install.cancelAction;

const commandExists = (command: string) => {
	return new Promise<boolean>((resolve) => {
		const check = os.platform() === 'win32'
			? { file: 'where.exe', args: [command] }
			: { file: 'sh', args: ['-lc', `command -v -- '${command.replace(/'/g, "'\\''")}'`] };

		const process = childProcess.spawn(check.file, check.args, {
			stdio: 'ignore',
			windowsHide: true
		});

		process.on('error', () => resolve(false));
		process.on('exit', (code) => resolve(code === 0));
	});
};

const openInstallTerminal = (label: string, installCommand: string) => {
	const terminal = vscode.window.createTerminal({ name: uiStrings.install.terminalName(label) });
	terminal.show(true);
	terminal.sendText(installCommand);
};

const getInstallCommand = (installer: CliInstaller) => {
	if ('install' in installer) {
		return os.platform() === 'win32' ? installer.install.windows : installer.install.unix;
	}

	return installer.installCommand;
};

export const isCliInstalled = (agent: CliAgent) => {
	return commandExists(agent.command);
};

export const ensureCliInstalled = async (agent: CliAgent) => {
	if (await isCliInstalled(agent)) {
		return true;
	}

	const installer = getCliInstaller(agent.label);
	if (!installer) {
		void vscode.window.showWarningMessage(
			uiStrings.install.notInstalledNoInstaller(agent.label),
			cancelAction
		);
		return false;
	}

	const choice = await vscode.window.showWarningMessage(
		uiStrings.install.notInstalledOffer(agent.label),
		cancelAction,
		installAction
	);

	if (choice === installAction) {
		openInstallTerminal(installer.label, getInstallCommand(installer));
	}

	return false;
};
