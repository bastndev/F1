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
		label: 'Codeep',
		command: 'codeep',
		installCommand: 'curl -fsSL https://raw.githubusercontent.com/VladoIvankovic/Codeep/main/install.sh | bash'
	}
];

export const getCliInstaller = (label: string) => {
	return cliInstallers.find((installer) => installer.label === label);
};
