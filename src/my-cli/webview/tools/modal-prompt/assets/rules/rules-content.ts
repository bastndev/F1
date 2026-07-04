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
			'Keep replies short and direct — never a long walkthrough of every change. Sign off by size: for a small change (1–2 files) reply with ONLY "Task completed successfully 🎉."; for anything larger (multiple files, multi-step, or architectural), reply with a short "Ready 🎉" (or similar) headline followed by a well-organized markdown table summarizing only the most important parts (e.g. columns like file, status, or file, lang, mode, status), using emojis for status (✅/❌) — no prose walkthrough, no per-file explanations. Expand only when I explicitly ask (e.g. "explain", "why", "step by step").',
	},
	{
		id: 'ask-before-changes',
		instruction:
			'Do not modify code, edit files, or run commands unless I explicitly authorize it first. Treat every message as discussion/planning by default. Only proceed with actual changes when I use an authorization phrase such as "adelante", "go", "puedes empezar", "tienes libre albedrío", "comienza", or clear equivalents — then execute the task as directed.',
	},
	{
		id: 'ai-facing-comments',
		instruction:
			'Write code comments for the AI, not for a human reader — the user does not read code. Comments must always be in English, as short as possible, and only explain what the code cannot express by itself (intent, why, edge cases, gotchas). No restating obvious logic, no long explanations, no comment blocks. Optimize for minimal tokens while keeping the AI\'s understanding of the project clear.',
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