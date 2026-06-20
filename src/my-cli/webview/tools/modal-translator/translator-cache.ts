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

// ── Paragraph-level reuse ───────────────────────────────────────────────────
// A second cache mapping a single source paragraph → its translated text. It's
// populated (only when alignment is certain — see the caller's count guard) as a
// side effect of translating a block, so later selecting just one paragraph of
// that block restores without a network call. Same RAM-only, ephemeral, bounded
// properties as the result cache above; values are plain text, so even a generous
// cap is only tens of KB.
const maxParagraphEntries = 60;
const paragraphMemo = new Map<string, string>();

/** Translated text for this exact source paragraph, or undefined. Touches LRU order. */
export const getCachedParagraph = (sourceParagraph: string): string | undefined => {
	const key = normalizeKey(sourceParagraph);
	if (!key) {
		return undefined;
	}

	const value = paragraphMemo.get(key);
	if (value === undefined) {
		return undefined;
	}

	paragraphMemo.delete(key);
	paragraphMemo.set(key, value);
	return value;
};

/** Remember one paragraph's translation, evicting the oldest past the cap. */
export const setCachedParagraph = (sourceParagraph: string, translated: string): void => {
	const key = normalizeKey(sourceParagraph);
	if (!key) {
		return;
	}

	paragraphMemo.delete(key);
	paragraphMemo.set(key, translated);

	if (paragraphMemo.size > maxParagraphEntries) {
		const oldest = paragraphMemo.keys().next().value;
		if (oldest !== undefined) {
			paragraphMemo.delete(oldest);
		}
	}
};
