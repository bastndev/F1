import * as childProcess from 'child_process';
import * as os from 'os';
import { cliAgents } from '../../shared/agents';
import type { CustomCliLaunch } from '../../shared/protocol';

type CustomCliResolveResult =
	| { ok: true; launch: CustomCliLaunch }
	| { ok: false; message: string };

const maxCommandLength = 64;
const commandNamePattern = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const blockedShellCommands = new Set([
	'bash',
	'cmd',
	'cmd.exe',
	'elvish',
	'fish',
	'nu',
	'pwsh',
	'powershell',
	'powershell.exe',
	'screen',
	'sh',
	'su',
	'sudo',
	'tmux',
	'wsl',
	'wsl.exe',
	'xonsh',
	'zsh'
]);

export const validateCustomCliCommandInput = (value: string) => {
	const command = value.trim();
	if (!command) {
		return undefined;
	}

	if (command.length > maxCommandLength) {
		return `Use ${maxCommandLength} characters or fewer.`;
	}

	if (/\s/.test(command)) {
		return 'Enter one CLI command name only. Arguments are not supported here.';
	}

	if (!commandNamePattern.test(command)) {
		return 'Use only letters, numbers, dot, dash, underscore, or plus.';
	}

	if (blockedShellCommands.has(command.toLowerCase())) {
		return 'Shells and terminal wrappers are blocked. Enter an installed AI CLI command.';
	}

	return undefined;
};

const commandExists = (command: string) => {
	return new Promise<boolean>((resolve) => {
		const check = os.platform() === 'win32'
			? { file: 'where.exe', args: [command] }
			: { file: 'which', args: [command] };
		let settled = false;

		const child = childProcess.spawn(check.file, check.args, {
			stdio: 'ignore',
			windowsHide: true
		});

		const finish = (exists: boolean) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timeout);
			resolve(exists);
		};

		const timeout = setTimeout(() => {
			try {
				child.kill();
			} catch {
				// The lookup may already have exited.
			}
			finish(false);
		}, 2500);

		child.on('error', () => finish(false));
		child.on('exit', (code) => finish(code === 0));
	});
};

const findFixedAgentForCommand = (command: string) => {
	const normalized = command.toLowerCase();
	return cliAgents.find((agent) => {
		return agent.command.toLowerCase() === normalized
			|| agent.label.toLowerCase() === normalized;
	});
};

const formatCustomCliLabel = (command: string) => {
	const label = command
		.split(/[._+-]+/)
		.filter(Boolean)
		.map((part) => part.toLowerCase() === 'cli' ? 'CLI' : part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');

	return label || command;
};

export const resolveCustomCliLaunch = async (value: string): Promise<CustomCliResolveResult> => {
	const command = value.trim();
	const validationMessage = validateCustomCliCommandInput(command);
	if (validationMessage || !command) {
		return { ok: false, message: validationMessage || 'Enter one CLI command name.' };
	}

	const fixedAgent = findFixedAgentForCommand(command);
	if (fixedAgent) {
		return { ok: false, message: `${fixedAgent.label} is already available in CLI Hub. Use its existing tile instead.` };
	}

	if (!(await commandExists(command))) {
		return { ok: false, message: `${command} is not installed or is not available in PATH.` };
	}

	return {
		ok: true,
		launch: {
			label: formatCustomCliLabel(command),
			command,
			args: []
		}
	};
};
