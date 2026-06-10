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

// Known personal typos worth flagging even when the dictionary is lenient
// (e.g. accent omissions like "codigo"). No-op entries (key === value) are skipped.
const personalMistakeKeys = new Set(
	Object.entries(PERSONAL_MISTAKES)
		.filter(([key, value]) => key.toLowerCase() !== value.toLowerCase())
		.map(([key]) => key.toLowerCase())
);

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

export async function checkText(text: string): Promise<SpellIssue[]> {
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

		if (isMisspelled(word, trie)) {
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

function isMisspelled(word: string, trie: SpanishTrie): boolean {
	const key = word.toLowerCase();

	const cached = wordCache.get(key);
	if (cached !== undefined) {
		return cached;
	}

	const misspelled = personalMistakeKeys.has(key)
		|| (!trie.has(word) && !trie.has(key) && !isEncliticVerb(key, trie));

	if (wordCache.size >= maxWordCacheEntries) {
		wordCache.clear();
	}
	wordCache.set(key, misspelled);

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
