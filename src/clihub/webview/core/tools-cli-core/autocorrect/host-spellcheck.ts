import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { PERSONAL_MISTAKES } from './data/personal-mistakes';
import { shouldProtectWord } from './data/protected-terms';

export interface SpellIssue {
	offset: number;
	length: number;
	word: string;
}

// Segments that must never be flagged: code spans/blocks, URLs, emails, paths,
// CLI flags, hex colors, ACRONYMS, file names, and dotted identifiers.
// Lifted verbatim from the former local-replacer so behavior stays consistent.
const protectedPattern = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s"'`<>]+|[\w.-]+@[\w.-]+\.\w{2,}|(?:\.{1,2}\/|~\/|\/)[^\s"'`<>]+|[A-Za-z]:\\[^\s"'`<>]+|#[0-9a-fA-F]{3,8}\b|\b[A-Z][A-Z0-9_]{1,}\b|(?<!\S)--?[A-Za-z][\w-]*(?:=[^\s"'`<>]+)?|\b(?:@[\w.-]+\/)?[\w.-]+@[\w.-]+\b|\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|html|css|scss|sass|md|mdx|svg|png|jpg|jpeg|gif|webp|yml|yaml|toml|env|lock)\b|\b[$A-Za-z_][\w$]*(?:[._:$][\w$-]+)+\b/g;
const wordPattern = /\p{L}+/gu;

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

interface SpanishTrie {
	has(word: string): boolean;
}

// esbuild emits this host bundle as CJS, which would downlevel a literal
// `import()` into `require()` and break on the ESM-only cspell-trie-lib.
// Hiding the import behind `new Function` keeps it a real dynamic import.
const dynamicImport = new Function('specifier', 'return import(specifier);') as (
	specifier: string
) => Promise<Record<string, unknown>>;

let triePromise: Promise<SpanishTrie | null> | null = null;
const wordCache = new Map<string, boolean>();
const maxWordCacheEntries = 5000;

async function loadTrie(): Promise<SpanishTrie | null> {
	try {
		const extJsonPath = require.resolve('@cspell/dict-es-es/cspell-ext.json');
		const triePath = path.join(path.dirname(extJsonPath), 'Spanish.trie.gz');
		const trieText = zlib.gunzipSync(fs.readFileSync(triePath)).toString('utf8');

		const trieLib = await dynamicImport('cspell-trie-lib');
		const decodeTrie = trieLib.decodeTrie as (text: string) => SpanishTrie;

		return decodeTrie(trieText);
	} catch (error) {
		console.error('[spellcheck] Failed to load Spanish dictionary:', error);
		return null;
	}
}

function getTrie(): Promise<SpanishTrie | null> {
	if (!triePromise) {
		triePromise = loadTrie();
	}

	return triePromise;
}

/** Preload the dictionary so the first keystroke isn't slowed by trie decoding. */
export function warmSpellchecker(): void {
	void getTrie();
}

export async function checkText(text: string, strict = false): Promise<SpellIssue[]> {
	if (!text || text.trim().length < 2) {
		return [];
	}

	const trie = await getTrie();
	if (!trie) {
		return [];
	}

	const protectedRanges: Array<[number, number]> = [];
	for (const match of text.matchAll(protectedPattern)) {
		const start = match.index ?? 0;
		protectedRanges.push([start, start + match[0].length]);
	}

	const isProtectedOffset = (offset: number) =>
		protectedRanges.some(([start, end]) => offset >= start && offset < end);

	const issues: SpellIssue[] = [];
	for (const match of text.matchAll(wordPattern)) {
		const word = match[0];
		const offset = match.index ?? 0;

		if (word.length <= 2 || isProtectedOffset(offset) || shouldProtectWord(word)) {
			continue;
		}

		if (isMisspelled(word, trie, strict)) {
			issues.push({ offset, length: word.length, word });
		}
	}

	return issues;
}

// Enclitic pronoun clusters that attach to infinitives/gerunds/imperatives
// (e.g. corregir + me). Longest-first so "melo" is tried before "lo"/"me".
const enclitics = [
	'noslo', 'nosla', 'melo', 'mela', 'telo', 'tela', 'selo', 'sela', 'oslo', 'osla',
	'nos', 'les', 'los', 'las', 'os', 'me', 'te', 'se', 'lo', 'la', 'le'
];

function isMisspelled(word: string, trie: SpanishTrie, strict: boolean): boolean {
	const key = word.toLowerCase();
	// Strict and lenient verdicts differ for the same word, so namespace the cache.
	const cacheKey = strict ? `s:${key}` : key;

	const cached = wordCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const personalKeys = strict ? personalMistakeKeysStrict : personalMistakeKeysLenient;
	const inDictionary = strict
		? trie.has(word) || trie.has(key)
		: trie.has(word) || matchesIgnoringAccents(key, trie);

	const misspelled = personalKeys.has(key) || (!inDictionary && !isEncliticVerb(key, trie));

	if (wordCache.size >= maxWordCacheEntries) {
		wordCache.clear();
	}
	wordCache.set(cacheKey, misspelled);

	return misspelled;
}

// The es dictionary covers most verb+pronoun forms, but has gaps (e.g. "corregirme").
// Strip a trailing enclitic and accept the word only when the remaining stem is a
// real infinitive/gerund in the dictionary — so true typos stay flagged.
function isEncliticVerb(lowerWord: string, trie: SpanishTrie): boolean {
	for (const clitic of enclitics) {
		if (lowerWord.length <= clitic.length + 2 || !lowerWord.endsWith(clitic)) {
			continue;
		}

		const stem = lowerWord.slice(0, lowerWord.length - clitic.length);
		if (!stem.endsWith('r') && !stem.endsWith('ndo')) {
			continue;
		}

		if (trie.has(stem) || trie.has(deaccent(stem))) {
			return true;
		}
	}

	return false;
}

function deaccent(value: string): string {
	return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const acuteAccent: Record<string, string> = { a: '\u00e1', e: '\u00e9', i: '\u00ed', o: '\u00f3', u: '\u00fa' };

// Accept a word as correct if it matches a dictionary entry once Spanish acute
// accents are ignored \u2014 i.e. the user typed "codigo"/"tambien" but the trie only
// knows "c\u00f3digo"/"tambi\u00e9n". We strip accents to a base form, then test every
// combination of accented vowels against the trie. Bounded to 6 vowels (\u226464
// lookups) so very long words fall back to the strict check; all results are
// cached by the caller, so steady-state cost is negligible.
function matchesIgnoringAccents(lowerWord: string, trie: SpanishTrie): boolean {
	if (trie.has(lowerWord)) {
		return true;
	}

	const base = deaccent(lowerWord);
	const vowelPositions: number[] = [];
	for (let i = 0; i < base.length; i++) {
		if (acuteAccent[base[i]]) {
			vowelPositions.push(i);
		}
	}

	if (vowelPositions.length === 0 || vowelPositions.length > 6) {
		return false;
	}

	const chars = base.split('');
	const combinations = 1 << vowelPositions.length;
	for (let mask = 0; mask < combinations; mask++) {
		for (let bit = 0; bit < vowelPositions.length; bit++) {
			const pos = vowelPositions[bit];
			chars[pos] = mask & (1 << bit) ? acuteAccent[base[pos]] : base[pos];
		}
		if (trie.has(chars.join(''))) {
			return true;
		}
	}

	return false;
}
