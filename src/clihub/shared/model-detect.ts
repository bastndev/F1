/**
 * Best-effort detection of the model a CLI session is using, by scanning the
 * session's output buffer for distinctive model identifiers (banner lines,
 * "/model" confirmations, status lines).
 *
 * Deliberately conservative: only agents with reliably recognizable model
 * strings are supported, every pattern requires a version digit so prose words
 * ("sonnet", "pro") can't match, and on no match we return undefined so the UI
 * shows nothing rather than a guess.
 */

type ModelPattern = {
	pattern: RegExp;
	/** Turn a regex match into display text; return undefined to reject. */
	format?: (match: RegExpMatchArray) => string | undefined;
};

const claudeFamily = '(opus|sonnet|haiku|fable)';

const agentPatterns: Record<string, ModelPattern[]> = {
	claude: [
		// Full model ids: claude-opus-4-8, claude-sonnet-4-6, claude-fable-5
		{
			pattern: new RegExp(`\\bclaude-${claudeFamily}-(\\d+)(?:-(\\d+))?\\b`, 'gi'),
			format: (m) => (m[3] ? `${m[1]} ${m[2]}.${m[3]}` : `${m[1]} ${m[2]}`),
		},
		// Display names with version: "Opus 4.8", "Sonnet 4.6", "Fable 5"
		{ pattern: new RegExp(`\\b${claudeFamily}\\s+(\\d+(?:\\.\\d+)?)\\b`, 'gi'), format: (m) => `${m[1]} ${m[2]}` },
	],
	codex: [
		// gpt-5.1-codex, gpt-5-codex-mini, gpt-5.2…
		{ pattern: /\bgpt-\d[\w.]*(?:-[a-z][\w.]*)*\b/gi },
	],
	grok: [
		// grok-4-latest, grok-code-fast-1… (digit required so "grok-cli" can't match)
		{ pattern: /\bgrok-(?=[a-z0-9.-]*\d)[a-z0-9.-]+\b/gi },
	],
	antigravity: [
		// gemini-3-pro-preview, gemini-2.5-flash…
		{ pattern: /\bgemini-\d[\w.-]*\b/gi },
		// Display names: "Gemini 3 Pro", "Gemini 2.5 Flash"
		{ pattern: /\bgemini\s+(\d+(?:\.\d+)?)\s+(pro|flash|ultra)\b/gi, format: (m) => `gemini ${m[1]} ${m[2]}` },
		// Antigravity also offers Claude models
		{
			pattern: new RegExp(`\\bclaude-${claudeFamily}-(\\d+)(?:-(\\d+))?\\b`, 'gi'),
			format: (m) => (m[3] ? `${m[1]} ${m[2]}.${m[3]}` : `${m[1]} ${m[2]}`),
		},
	],
};

// OSC, CSI, and bare escape sequences — terminal buffers are full of them and
// they can split a model id ("gpt-\x1b[1m5.1") or hide one inside a title.
const stripAnsi = (value: string): string =>
	value
		.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
		.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
		.replace(/\x1b[@-Z\\-_]/g, '');

const maxDisplayLength = 28;

/**
 * Scan a session's output for the model in use. Returns the LAST confident
 * match so mid-session switches (e.g. "/model") update the result, or
 * undefined when nothing distinctive was printed.
 */
export function detectModelName(agentSlug: string, rawBuffer: string): string | undefined {
	const patterns = agentPatterns[agentSlug];
	if (!patterns || !rawBuffer) {
		return undefined;
	}

	const text = stripAnsi(rawBuffer);

	let best: { index: number; value: string } | undefined;
	for (const { pattern, format } of patterns) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			const value = (format ? format(match) : match[0])?.toLowerCase().trim();
			if (!value || value.length > maxDisplayLength) {
				continue;
			}
			const index = match.index ?? 0;
			if (!best || index >= best.index) {
				best = { index, value };
			}
		}
	}

	return best?.value;
}
