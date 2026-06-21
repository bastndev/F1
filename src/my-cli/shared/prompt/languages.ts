/**
 * Source-language table for the prompt composer. The user picks ONE source
 * language; the translator target is always English. Picking a language drives
 * three things at once, all encoded here so the rules live in exactly one place:
 *
 *   • translation  — `<code> → en` (skipped entirely for English, source == target)
 *   • spell-check  — fixnow has dictionaries for en/es/pt but NOT zh (Chinese is
 *                    character-based; a trie/word checker doesn't apply)
 *   • the strict-accents toggle — only Spanish has a meaningful "accept missing
 *                    tildes" mode to override; fixnow's accent leniency is
 *                    Spanish-only, so pt/en are always accent-strict by nature.
 *
 * Only these four are offered. Both the picker UI (webview) and the host
 * spell-check/translation read from this list, so it must stay DOM- and
 * vscode-free (pure data + types).
 */

export type PromptLang = 'en' | 'es' | 'zh' | 'pt';

export interface PromptLanguage {
	code: PromptLang;
	/** Human label shown in the picker menu. */
	label: string;
	/** Flag emoji shown in the picker + indicator (may fall back to letters on some Linux fonts). */
	flag: string;
	/** False only for English — its text is sent verbatim, no translator round-trip. */
	translates: boolean;
	/** False for Chinese — fixnow has no usable checker for it. */
	spellcheck: boolean;
	/** Whether to show the strict-accents toggle. Only Spanish (fixnow's accent leniency is es-only). */
	strictToggle: boolean;
}

export const PROMPT_LANGUAGES: readonly PromptLanguage[] = [
	{ code: 'en', label: 'English',    flag: '🇺🇲', translates: false, spellcheck: true,  strictToggle: false },
	{ code: 'es', label: 'Spanish',    flag: '🇪🇸', translates: true,  spellcheck: true,  strictToggle: true  },
	{ code: 'zh', label: 'Chinese',    flag: '🇨🇳', translates: true,  spellcheck: false, strictToggle: false },
	{ code: 'pt', label: 'Portuguese', flag: '🇧🇷', translates: true,  spellcheck: true,  strictToggle: false },
];

/** Placeholder shown before any language is chosen. */
export const PROMPT_LANG_GLOBE = '🌐';

const byCode = new Map<string, PromptLanguage>(PROMPT_LANGUAGES.map((lang) => [lang.code, lang]));

export function isPromptLang(value: string | undefined | null): value is PromptLang {
	return typeof value === 'string' && byCode.has(value);
}

export function getPromptLanguage(code: string | undefined | null): PromptLanguage | undefined {
	return typeof code === 'string' ? byCode.get(code) : undefined;
}
