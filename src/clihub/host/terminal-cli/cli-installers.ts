export type CliInstaller = {
	label: string;
	command: string;
} & (
	| {
		install: {
			unix: string;
			windows: string;
		};
	}
	| {
		installCommand: string;
	}
);

export const cliInstallers: CliInstaller[] = [
	{
		label: 'OpenCode',
		command: 'opencode',
		install: {
			unix: 'curl -fsSL https://opencode.ai/install | bash',
			windows: 'curl -fsSL https://opencode.ai/install | bash'
		}
	},
	{
		label: 'Codex CLI',
		command: 'codex',
		install: {
			unix: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
			windows: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"'
		}
	},
	{
		label: 'Claude Code',
		command: 'claude',
		install: {
			unix: 'curl -fsSL https://claude.ai/install.sh | bash',
			windows: 'curl -fsSL https://claude.ai/install.sh | bash'
		}
	},
	{
		label: 'Antigravity CLI',
		command: 'agy',
		install: {
			unix: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
			windows: 'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd'
		}
	},
	{
		label: 'Copilot CLI',
		command: 'copilot',
		installCommand: 'curl -fsSL https://gh.io/copilot-install | bash'
	},
	{
		label: 'Cursor',
		command: 'cursor',
		install: {
			unix: 'curl https://cursor.com/install -fsS | bash',
			windows: 'curl https://cursor.com/install -fsS | bash'
		}
	},
	{
		label: 'Kiro CLI',
		command: 'kiro-cli',
		install: {
			unix: 'curl -fsSL https://cli.kiro.dev/install | bash',
			windows: "irm 'https://cli.kiro.dev/install.ps1' | iex"
		}
	},
	{
		label: 'Kilo Code',
		command: 'kilo',
		install: {
			unix: 'curl -fsSL https://kilo.ai/cli/install | bash',
			windows: 'npm install -g @kilocode/cli'
		}
	},
	{
		label: 'Grok',
		command: 'grok',
		install: {
			unix: 'curl -fsSL https://x.ai/cli/install.sh | bash',
			windows: 'curl -fsSL https://x.ai/cli/install.sh | bash'
		}
	}
];

export const getCliInstaller = (label: string) => {
	return cliInstallers.find((installer) => installer.label === label);
};
