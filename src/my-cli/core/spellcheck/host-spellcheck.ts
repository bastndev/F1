import type { CheckOptions, LanguageCode, SpellIssue as FixnowSpellIssue } from 'fixnow';
import { PERSONAL_MISTAKES } from './data/personal-mistakes';
import { shouldProtectWord } from './data/protected-terms';

export interface SpellIssue {
	offset: number;
	length: number;
	word: string;
}

// F1-specific markers that fixnow's default tokenizer no longer skips (they were
// dropped in fixnow 2.0). Composed with fixnow's DEFAULT_PROTECTED_PATTERN so the
// prompt's image/code/text/skill chips are never flagged as misspellings.
const F1_MARKERS = /\[(?:Image|Code|Text) #\d+[^\]\n]*\]|\[Skills? #[^\]\n]+\]|\/skills #\d+|\/skill\b/g;

// Known personal typos worth flagging even when the dictionary is lenient.
// Two sets, selected by the "strict" mode:
//   • lenient (default): skip no-op entries (key === value) AND accent-only
//     fixes (e.g. "codigo" → "código", "mas" → "más"). A missing tilde never
//     changes the meaning that reaches the CLI after ES→EN translation, so
//     flagging it is just noise.
//   • strict: skip only no-op entries, so accent omissions ARE flagged again.
const personalMistakeKeysLenient = new Set<string>();
const personalMistakeKeysStrict = new Set<string>();
for (const [rawKey, rawValue] of Object.entries(PERSONAL_MISTAKES)) {
	const key = rawKey.toLowerCase();
	const value = rawValue.toLowerCase();
	if (key === value) {
		continue;
	}
	personalMistakeKeysStrict.add(key);
	if (deaccent(key) !== deaccent(value)) {
		personalMistakeKeysLenient.add(key);
	}
}

function deaccent(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// The spell checker (Spanish trie + accent/enclitic logic) lives in `fixnow`,
// loaded from node_modules so its on-disk dictionary resolves — fixnow must stay
// external (see esbuild.js). esbuild emits this host bundle as CJS, which would
// downlevel a literal `import()` into `require()` and break the ESM entry; hiding
// the import behind `new Function` keeps it a real dynamic import.
interface FixnowModule {
	checkText(text: string, options: CheckOptions): Promise<FixnowSpellIssue[]>;
	warmup(language?: string): Promise<void>;
	DEFAULT_PROTECTED_PATTERN: RegExp;
}

const dynamicImport = new Function('specifier', 'return import(specifier);') as (
	specifier: string
) => Promise<FixnowModule>;

let fixnowPromise: Promise<FixnowModule> | null = null;

function getFixnow(): Promise<FixnowModule> {
	if (!fixnowPromise) {
		fixnowPromise = dynamicImport('fixnow');
	}

	return fixnowPromise;
}

// fixnow bundles dictionaries for ar/de/en/es/fr/pt/ru/vi. Of the prompt's five
// offered languages only these have a usable checker — Chinese (zh) is
// character-based and has no trie, so it falls through to "no marking".
const SUPPORTED_LANGUAGES = new Set(['en', 'es', 'pt', 'ru']);

// Corrections attached per flagged word. The Alt-click fix applies the first one;
// a few extras are kept cheaply in case a richer picker is added later.
const SUGGESTION_LIMIT = 3;

const normalizeLanguage = (lang: string | undefined): string => (lang ?? 'es').toLowerCase();

/** Preload a dictionary so the first keystroke isn't slowed by trie decoding. */
export function warmSpellchecker(lang = 'es'): void {
	const language = normalizeLanguage(lang);
	if (!SUPPORTED_LANGUAGES.has(language)) {
		return;
	}

	void getFixnow()
		.then((fixnow) => fixnow.warmup(language))
		.catch((error) => {
			console.error(`[spellcheck] Failed to warm "${language}" dictionary:`, error);
		});
}

export async function checkText(text: string, lang = 'es', strict = false): Promise<SpellIssue[]> {
	if (!text || text.trim().length < 2) {
		return [];
	}

	const language = normalizeLanguage(lang);
	if (!SUPPORTED_LANGUAGES.has(language)) {
		return [];
	}

	let fixnow: FixnowModule;
	try {
		fixnow = await getFixnow();
	} catch (error) {
		console.error('[spellcheck] Failed to load fixnow:', error);
		return [];
	}

	// The personal-typo list is Spanish-specific shorthand ("ue" → "que"); only
	// apply it when checking Spanish. Other languages rely on the dictionary alone.
	const flagWords = language === 'es'
		? (strict ? personalMistakeKeysStrict : personalMistakeKeysLenient)
		: undefined;

	const issues = await fixnow.checkText(text, {
		// Narrowed by SUPPORTED_LANGUAGES above — all members are valid LanguageCodes.
		language: language as LanguageCode,
		// strict → accent-sensitive; lenient (default) → accept missing tildes.
		acceptAccentOmissions: !strict,
		isProtectedWord: shouldProtectWord,
		flagWords,
		protectedSegments: [fixnow.DEFAULT_PROTECTED_PATTERN, F1_MARKERS],
		// Attach corrections so the webview's Alt-click fix is an instant local
		// replace. Cheap for prompt-sized text (only flagged words are scored).
		suggestions: true,
		maxSuggestions: SUGGESTION_LIMIT,
	});

	if (language !== 'es') {
		return issues;
	}

	// Spanish: prefer the known personal-typo correction (e.g. "tb" → "también")
	// at the top of the list, falling back to fixnow's dictionary suggestions.
	return issues.map((issue) => {
		const personal = PERSONAL_MISTAKES[issue.word.toLowerCase()];
		if (!personal) {
			return issue;
		}
		const rest = (issue.suggestions ?? []).filter(
			(suggestion) => suggestion.toLowerCase() !== personal.toLowerCase()
		);
		return { ...issue, suggestions: [personal, ...rest] };
	});
}
