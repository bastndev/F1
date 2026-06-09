export type CliAgent = {
	label: string;
	command: string;
	args: string[];
};

export const cliAgents: CliAgent[] = [
	{ label: 'OpenCode', command: 'opencode', args: [] },
	{ label: 'Codex CLI', command: 'codex', args: [] },
	{ label: 'Claude Code', command: 'claude', args: [] },
	{ label: 'Antigravity CLI', command: 'agy', args: [] },
	{ label: 'Copilot CLI', command: 'copilot', args: [] },
	{ label: 'Cursor', command: 'cursor', args: ['agent'] },
	{ label: 'Amp', command: 'amp', args: [] },
	{ label: 'Kiro CLI', command: 'kiro-cli', args: [] },
	{ label: 'Kilo Code', command: 'kilo', args: [] },
	{ label: 'Grok', command: 'grok', args: [] }
];

export const allowedAgents = new Set(cliAgents.map((agent) => agent.label));

export const getCliAgent = (label: string) => {
	return cliAgents.find((agent) => agent.label === label);
};
