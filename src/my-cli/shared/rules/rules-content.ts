/**
 * The behavioural rules F1 injects into a CLI session when the "rules" button is
 * pressed. Pure data — no DOM, no host APIs — so it bundles straight into the
 * webview and stays packaging-proof (no runtime disk read, unlike my-smart's
 * SKILL.md asset). This is the single place to edit or grow the rules; add a
 * rule by appending one entry to RULES.
 *
 * Two constraints shape everything here:
 *
 * 1. The prompt is ONE line (spaces, never newlines): it is typed into the
 *    CLI's input box and a raw newline would submit it early on TUI CLIs.
 *    Length is real time — bubbletea CLIs (opencode/kilocode) receive it one
 *    code point at a time at ~8ms each, so every 125 chars ≈ 1s of typing.
 *
 * 2. The host confirms delivery by searching the session's RENDERED terminal
 *    buffer for RULES_MARKER (literal case-sensitive includes — see
 *    main._handleInjectRules / sessionManager.bufferContains). If it never
 *    matches, the modal stays locked until a 60s cap. So the marker must
 *    survive whatever the CLI does when displaying the reply:
 *    - all-lowercase: some CLIs lowercase their whole transcript;
 *    - no markdown-active chars (a leading ">>" was once rendered as a
 *      blockquote, destroying the literal match);
 *    - short plain ASCII, no emoji: less line-wrap and re-shaping risk.
 */

/** The needle the host watches for in the terminal buffer. Keep it lowercase,
 *  markdown-inert, short — see constraint 2 above. */
export const RULES_MARKER = 'rules applied';

/** The exact line the agent is asked to reply with. Derived from RULES_MARKER
 *  so the watched needle is always a substring of the reply. */
export const RULES_CONFIRMATION = `${RULES_MARKER} 🛠️`;

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
			'If my message ends with "I read you" (or the Spanish "te leo"), make NO changes — no file edits, no commands, no code. Only answer or discuss, and stay in that mode until I give a clear new task.',
	},
	{
		id: 'concise',
		instruction:
			'Keep replies short and direct, never a walkthrough of every change. Sign off by size: for a small change (1–2 files) reply ONLY "Task completed successfully 🎉"; for anything larger, a short "Ready 🎉"-style headline plus one tidy markdown table of only the most important parts (e.g. file/status columns, ✅/❌ for status) — no prose, no per-file explanations. Expand only when I explicitly ask (e.g. "explain", "why", "step by step").',
	},
	{
		id: 'direct-command-authorization',
		instruction:
			'A clear, specific instruction to change something ("delete file X", "borra ese archivo", "rename this function") is itself authorization — execute it without asking for approval. Hold back only when the message is discussion-shaped (a question, an idea, a problem description, "what do you think", "maybe") or ambiguous about what exactly to change; there, propose and wait for a go-ahead ("go", "dale", "adelante", or a clear equivalent).',
	},
	{
		id: 'question-first',
		instruction:
			'A question outranks any instruction in the same message: if I ask you something — your opinion, a recommendation, a yes/no, or whether an approach will work (usually ends with "?") — answer it and do NOT implement or change anything yet, even if I also told you to make a change. If the message mixed a question with an instruction, end your reply with exactly: ✋ I\'m ready to implement — I need your authorization. A "?" that is only part of what I ask you to build (inside quotes or code) does not count.',
	},
	{
		id: 'ai-facing-comments',
		instruction:
			'Write code comments for the AI, not for a human reader — the user does not read code. Comments must be in English, as short as possible, and only say what the code cannot express itself (intent, why, edge cases, gotchas); never restate obvious logic. Optimize for minimal tokens while keeping the AI\'s understanding of the project clear.',
	},
];

/** Build the single-line rules prompt typed into the CLI. */
export const buildRulesPrompt = (): string => {
	const numbered = RULES.map((rule, i) => `(${i + 1}) ${rule.instruction}`).join(' ');
	return (
		'For the rest of this session, follow these rules in addition to your normal behaviour: '
		+ numbered
		+ ` To confirm, your entire reply must be ONLY this exact line — nothing before or after it, no reasoning, no quotes, no formatting: ${RULES_CONFIRMATION}`
	);
};
