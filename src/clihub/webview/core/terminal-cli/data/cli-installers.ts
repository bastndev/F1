export type CliInstaller = {
	label: string;
	command: string;
	installCommand: string;
};

export const cliInstallers: CliInstaller[] = [
	{
		label: 'OpenCode',
		command: 'opencode',
		installCommand: 'curl -fsSL https://opencode.ai/install | bash'
	},
	{
		label: 'Codex CLI',
		command: 'codex',
		installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
	},
	{
		label: 'Claude Code',
		command: 'claude',
		installCommand: 'curl -fsSL https://claude.ai/install.sh | bash'
	},
	{
		label: 'Antigravity CLI',
		command: 'agy',
		installCommand: 'curl -fsSL https://antigravity.google/cli/install.sh | bash'
	},
	{
		label: 'GitHub Copilot CLI',
		command: 'copilot',
		installCommand: 'curl -fsSL https://gh.io/copilot-install | bash'
	},
	{
		label: 'Codeep',
		command: 'codeep',
		installCommand: 'curl -fsSL https://raw.githubusercontent.com/VladoIvankovic/Codeep/main/install.sh | bash'
	},
	{
		label: 'Amp',
		command: 'amp',
		installCommand: 'curl -fsSL https://ampcode.com/install.sh | bash'
	},
	{
		label: 'Kiro CLI',
		command: 'kiro-cli',
		installCommand: 'curl -fsSL https://cli.kiro.dev/install | bash'
	},
	{
		label: 'Kilo Code',
		command: 'kilo',
		installCommand: 'curl -fsSL https://kilo.ai/cli/install | bash'
	}
];

export const getCliInstaller = (label: string) => {
	return cliInstallers.find((installer) => installer.label === label);
};
