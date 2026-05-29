export type CliAgent = {
	label: string;
	command: string;
	args: string[];
};

export const cliAgents: CliAgent[] = [
	{ label: 'OpenCode', command: 'opencode', args: [] },
	{ label: 'Antigravity CLI', command: 'agy', args: [] },
	{ label: 'Claude Code', command: 'claude', args: [] },
	{ label: 'Codex CLI', command: 'codex', args: [] },
	{ label: 'GitHub Copilot CLI', command: 'copilot', args: [] },
	{ label: 'Kiro CLI', command: 'kiro-cli', args: [] },
	{ label: 'Amp', command: 'amp', args: [] },
	{ label: 'Kilo Code', command: 'kilo', args: [] }
];

export const allowedAgents = new Set(cliAgents.map((agent) => agent.label));

export const getCliAgent = (label: string) => {
	return cliAgents.find((agent) => agent.label === label);
};
