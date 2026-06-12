/**
 * Single registry for every CLI agent the hub can launch.
 *
 * Adding an agent: add one entry here, drop its SVG into
 * src/webview/assets/icons-cli/, and (optionally) add an installer entry in
 * src/host/terminal-cli/cli-installers.ts.
 */
export type CliAgent = {
	label: string;
	command: string;
	args: string[];
	/** Stable id used for CSS theming (data-agent) and model detection. */
	slug: string;
	/** Search aliases for the launcher's fuzzy input. */
	aliases: string[];
	/** Icon file name inside assets/icons-cli/. */
	iconFile: string;
	darkIcon?: boolean;
	lightIcon?: boolean;
};

export const cliAgents: CliAgent[] = [
	{ label: 'OpenCode', command: 'opencode', args: [], slug: 'opencode', aliases: ['opencode', 'open code', 'op'], iconFile: 'opencode.svg', lightIcon: true },
	{ label: 'Codex CLI', command: 'codex', args: [], slug: 'codex', aliases: ['codex', 'codex cli', 'code', 'co', 'c'], iconFile: 'codex.svg' },
	{ label: 'Claude Code', command: 'claude', args: [], slug: 'claude', aliases: ['claude', 'claude code'], iconFile: 'claudecode.svg' },
	{ label: 'Antigravity CLI', command: 'agy', args: [], slug: 'antigravity', aliases: ['antigravity', 'antigravity cli', 'agy', 'an', 'ant'], iconFile: 'Antigravity_cli.svg' },
	{ label: 'Copilot CLI', command: 'copilot', args: [], slug: 'copilot', aliases: ['github copilot', 'copilot', 'copilot cli'], iconFile: 'github-copilot.svg', darkIcon: true },
	{ label: 'Cursor', command: 'cursor', args: ['agent'], slug: 'cursor', aliases: ['cursor'], iconFile: 'cursor.svg', darkIcon: true },
	{ label: 'Amp', command: 'amp', args: [], slug: 'amp', aliases: ['amp'], iconFile: 'amp.svg' },
	{ label: 'Kiro CLI', command: 'kiro-cli', args: [], slug: 'kiro', aliases: ['kiro', 'kiro cli'], iconFile: 'kiro.svg' },
	{ label: 'Kilo Code', command: 'kilo', args: [], slug: 'kilocode', aliases: ['kilo', 'kilo code', 'code', 'k'], iconFile: 'kilocode.svg', darkIcon: true },
	{ label: 'Grok', command: 'grok', args: [], slug: 'grok', aliases: ['grok'], iconFile: 'grok.svg', darkIcon: true }
];

export const allowedAgents = new Set(cliAgents.map((agent) => agent.label));

export const getCliAgent = (label: string) => {
	return cliAgents.find((agent) => agent.label === label);
};

/**
 * Slug for a session/launcher label. Exact label match first, then a fuzzy
 * fallback (label contains the slug, or equals an alias) so close variants
 * like "open code" still resolve. Returns undefined for unknown labels —
 * callers pick their own default ('' for the launcher, 'default' for the
 * terminal theme).
 */
export const getAgentSlug = (label: string): string | undefined => {
	const exact = getCliAgent(label);
	if (exact) {
		return exact.slug;
	}

	const lower = label.toLowerCase();
	for (const agent of cliAgents) {
		if (lower.includes(agent.slug) || agent.aliases.includes(lower)) {
			return agent.slug;
		}
	}

	return undefined;
};
