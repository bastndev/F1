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
	{ label: 'Gemini CLI', command: 'gemini', args: [] },
	{ label: 'Aider', command: 'aider', args: [] },
	{ label: 'GitHub Copilot CLI', command: 'gh', args: ['copilot'] },
	{ label: 'Cline', command: 'cline', args: [] },
	{ label: 'Kiro CLI', command: 'kiro', args: [] },
	{ label: 'Goose', command: 'goose', args: [] },
	{ label: 'Amp', command: 'amp', args: [] },
	{ label: 'Continue CLI', command: 'continue', args: [] },
	{ label: 'Kilo Code', command: 'kilo', args: [] },
	{ label: 'Tabnine CLI', command: 'tabnine', args: [] },
	{ label: 'Pi', command: 'pi', args: [] }
];

export const allowedAgents = new Set(cliAgents.map((agent) => agent.label));

export const getCliAgent = (label: string) => {
	return cliAgents.find((agent) => agent.label === label);
};
