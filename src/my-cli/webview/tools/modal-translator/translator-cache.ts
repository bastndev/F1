/**
 * Exact-match translation memo for the translator panel.
 *
 * Keyed by the trimmed source text (the panel only ever does EN→ES), it holds the
 * already-rendered result so re-opening or revisiting the *same* selection restores
 * instantly — no skeleton, no host round-trip, no re-render.
 *
 * Deliberately RAM-only and tiny. It lives in this module, so it dies when the
 * webview is torn down (closing the CLI panel, switching panels, closing VS Code);
 * nothing is ever written to disk. The extension host keeps its own bounded cache
 * as the network safety net. Bounded LRU so it can never grow unchecked.
 *
 * Note: matching is per exact selection. A fragment of a previously translated
 * block is a different key, so it translates once (then it too is cached) — machine
 * translation reorders words, so a block's translation can't be sliced to a fragment.
 */
export type TranslationMemoEntry = {
	/** Markdown passed to revealText (incl. tree / [[code-here:N]] markers). */
	rendered: string;
	/** Raw text the Copy button writes to the clipboard. */
	copyText: string;
	/** Footer status string, e.g. "translated · google translate". */
	status: string;
};

const maxEntries = 15;
const memo = new Map<string, TranslationMemoEntry>();

const normalizeKey = (sourceText: string): string => sourceText.trim();

/** Most-recent result for this exact source text, or undefined. Touches LRU order. */
export const getCachedTranslation = (sourceText: string): TranslationMemoEntry | undefined => {
	const key = normalizeKey(sourceText);
	if (!key) {
		return undefined;
	}

	const entry = memo.get(key);
	if (!entry) {
		return undefined;
	}

	// Re-insert so it becomes most-recently-used.
	memo.delete(key);
	memo.set(key, entry);
	return entry;
};

/** Remember a successful translation, evicting the oldest entry past the cap. */
export const setCachedTranslation = (sourceText: string, entry: TranslationMemoEntry): void => {
	const key = normalizeKey(sourceText);
	if (!key) {
		return;
	}

	memo.delete(key);
	memo.set(key, entry);

	if (memo.size > maxEntries) {
		const oldest = memo.keys().next().value;
		if (oldest !== undefined) {
			memo.delete(oldest);
		}
	}
};
