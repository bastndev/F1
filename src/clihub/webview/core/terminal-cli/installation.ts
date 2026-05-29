import * as childProcess from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import type { CliAgent } from './agents';
import { getCliInstaller, type CliInstaller } from './data/cli-installers';

const installAction = 'Install';
const cancelAction = 'Cancel';

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
	const terminal = vscode.window.createTerminal({ name: `Install ${label}` });
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

	// TODO: future multi language nls.json.
	const installer = getCliInstaller(agent.label);
	if (!installer) {
		void vscode.window.showWarningMessage(
			`${agent.label} is not installed or is not available in PATH.`,
			cancelAction
		);
		return false;
	}

	const choice = await vscode.window.showWarningMessage(
		`${agent.label} is not installed. You can install it now in an integrated terminal.`,
		cancelAction,
		installAction
	);

	if (choice === installAction) {
		openInstallTerminal(installer.label, getInstallCommand(installer));
	}

	return false;
};
