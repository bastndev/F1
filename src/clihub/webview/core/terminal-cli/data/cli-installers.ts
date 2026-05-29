export type CliInstaller = {
	label: string;
	command: string;
	installCommand: string;
};

export const cliInstallers: CliInstaller[] = [
	{
		label: 'Kilo Code',
		command: 'kilo',
		installCommand: 'curl -fsSL https://kilo.ai/cli/install | bash'
	},
	{
		label: 'Goose',
		command: 'goose',
		installCommand: 'curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash'
	}
];

export const getCliInstaller = (label: string) => {
	return cliInstallers.find((installer) => installer.label === label);
};
