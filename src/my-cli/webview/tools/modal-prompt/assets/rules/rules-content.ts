/**
 * The behavioural rules F1 injects into a CLI session when the "rules" button is
 * pressed. Pure data — no DOM, no host APIs — so it bundles straight into the
 * webview and stays packaging-proof (no runtime disk read, unlike my-smart's
 * SKILL.md asset). This is the single place to edit or grow the rules; add a
 * keyword by appending one entry to RULES.
 *
 * The prompt is built as ONE line (spaces, never newlines): it is typed into the
 * CLI's input box and a raw newline would submit it early on TUI CLIs.
 */

/** The exact line the agent is asked to reply with — the host watches for it to
 *  know the rules landed (see main._handleInjectRules). Keep it in sync there. */
export const RULES_CONFIRMATION = '>> Rules applied 🛠️';

type RuleEntry = {
	/** Stable id for future per-rule wiring; not shown to the agent. */
	id: string;
	/** One self-contained instruction, phrased in English for every CLI. */
	instruction: string;
};

const RULES: readonly RuleEntry[] = [
	{
		id: 'read-you',
		instruction:
			'When my message ends with "I read you" (or the Spanish "te leo"), make NO changes — do not edit files, run commands, or write code. Only answer or discuss what I asked, and stay in that discussion mode until I give you a clear new task.',
	},
	{
		id: 'concise',
		instruction:
			'Keep replies short and direct. When you finish a task, do not write a long walkthrough of every change — sign off by size: for a small change (1–2 files) end with "Task completed successfully 🎉."; for a medium change (3–5 files) add a short sorted checklist of what you did; for a large or architectural change add a brief collapsible <details> summary. Expand only when I explicitly ask (e.g. "explain", "why", "step by step").',
	},
];

/** Build the single-line rules prompt typed into the CLI. */
export const buildRulesPrompt = (): string => {
	const numbered = RULES.map((rule, i) => `(${i + 1}) ${rule.instruction}`).join(' ');
	return (
		'For the rest of this session, follow these rules in addition to your normal behaviour: '
		+ numbered
		+ ` Your entire reply must be ONLY this exact line and nothing before or after it — no reasoning, no preamble, no explanation, no quotes, no extra symbols, no formatting: ${RULES_CONFIRMATION}`
	);
};