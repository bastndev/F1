import type Typo from 'typo-js';
import { getTypoInstance } from './typo-service';
import { applyPersonalMistakesWithStats } from './data/personal-mistakes';
import { isProtectedTerm, shouldProtectWord } from './data/protected-terms';

export interface AutocorrectTextResult {
	correctedText: string;
	personalCorrections: number;
	typoCorrections: number;
}

type SegmentResult = {
	text: string;
	personalCorrections: number;
	typoCorrections: number;
};

const protectedPattern = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s"'`<>]+|[\w.-]+@[\w.-]+\.\w{2,}|(?:\.{1,2}\/|~\/|\/)[^\s"'`<>]+|[A-Za-z]:\\[^\s"'`<>]+|#[0-9a-fA-F]{3,8}\b|\b[A-Z][A-Z0-9_]{1,}\b|(?<!\S)--?[A-Za-z][\w-]*(?:=[^\s"'`<>]+)?|\b(?:@[\w.-]+\/)?[\w.-]+@[\w.-]+\b|\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|html|css|scss|sass|md|mdx|svg|png|jpg|jpeg|gif|webp|yml|yaml|toml|env|lock)\b|\b[$A-Za-z_][\w$]*(?:[._:$][\w$-]+)+\b/g;
const wordPattern = /[\p{L}]+/gu;
const correctionCache = new Map<string, string | null>();
const maxCacheEntries = 1200;

export async function autocorrectText(text: string): Promise<string> {
	return (await autocorrectTextWithStats(text)).correctedText;
}

export async function autocorrectTextWithStats(text: string): Promise<AutocorrectTextResult> {
	const typo = await getTypoInstance();
	let result = '';
	let lastIndex = 0;
	let personalCorrections = 0;
	let typoCorrections = 0;

	for (const match of text.matchAll(protectedPattern)) {
		const index = match.index ?? 0;
		const segment = replaceSegment(text.slice(lastIndex, index), typo);
		result += segment.text + match[0];
		personalCorrections += segment.personalCorrections;
		typoCorrections += segment.typoCorrections;
		lastIndex = index + match[0].length;
	}

	const tail = replaceSegment(text.slice(lastIndex), typo);
	result += tail.text;
	personalCorrections += tail.personalCorrections;
	typoCorrections += tail.typoCorrections;

	return {
		correctedText: result,
		personalCorrections,
		typoCorrections,
	};
}

function replaceSegment(segment: string, typo: Typo | null): SegmentResult {
	const personal = applyPersonalMistakesWithStats(segment);
	if (!typo) {
		return {
			text: personal.text,
			personalCorrections: personal.corrections,
			typoCorrections: 0,
		};
	}

	let typoCorrections = 0;
	const text = personal.text.replace(wordPattern, (word) => {
		const correction = getWordCorrection(word, typo);
		if (!correction || correction === word) {
			return word;
		}

		typoCorrections++;
		return correction;
	});

	return {
		text,
		personalCorrections: personal.corrections,
		typoCorrections,
	};
}

function getWordCorrection(word: string, typo: Typo): string | null {
	if (word.length <= 2 || shouldProtectWord(word)) {
		return null;
	}

	const cacheKey = normalizeForCache(word);
	if (correctionCache.has(cacheKey)) {
		const cached = correctionCache.get(cacheKey);
		return cached ? applyOriginalCasing(word, cached) : null;
	}

	let correction: string | null = null;
	if (!typo.check(word) && !typo.check(cacheKey)) {
		const suggestions = typo.suggest(word).slice(0, 4);
		correction = chooseSafeSuggestion(word, suggestions);
	}

	setCachedCorrection(cacheKey, correction);
	return correction ? applyOriginalCasing(word, correction) : null;
}

function chooseSafeSuggestion(word: string, suggestions: string[]): string | null {
	if (suggestions.length === 0) {
		return null;
	}

	const normalizedWord = normalizeForDistance(word);
	const candidates = suggestions
		.map((suggestion) => ({
			suggestion,
			distance: levenshtein(normalizedWord, normalizeForDistance(suggestion)),
		}))
		.filter(({ suggestion, distance }) => isSafeSuggestion(word, suggestion, distance))
		.sort((a, b) => a.distance - b.distance || a.suggestion.length - b.suggestion.length);

	if (candidates.length === 0) {
		return null;
	}

	const [best, second] = candidates;
	if (second && best.distance === second.distance && word.length <= 5) {
		return null;
	}

	return best.suggestion;
}

function isSafeSuggestion(word: string, suggestion: string, distance: number): boolean {
	const lowerWord = word.toLocaleLowerCase('es');
	const lowerSuggestion = suggestion.toLocaleLowerCase('es');
	const normalizedWord = normalizeForDistance(word);
	const normalizedSuggestion = normalizeForDistance(suggestion);

	if (!suggestion || lowerWord === lowerSuggestion) {
		return false;
	}

	if (isProtectedTerm(suggestion) || shouldProtectWord(suggestion)) {
		return false;
	}

	if (distance > getMaxDistance(word.length)) {
		return false;
	}

	if (normalizedWord === normalizedSuggestion) {
		return word.length > 4;
	}

	if (word.length <= 4 && normalizedWord.charAt(0) !== normalizedSuggestion.charAt(0)) {
		return false;
	}

	return true;
}

function getMaxDistance(length: number): number {
	if (length <= 4) {
		return 1;
	}
	if (length <= 8) {
		return 2;
	}
	if (length <= 14) {
		return 3;
	}
	return 2;
}

function normalizeForCache(word: string): string {
	return word.toLocaleLowerCase('es');
}

function normalizeForDistance(word: string): string {
	return word
		.toLocaleLowerCase('es')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

function setCachedCorrection(key: string, correction: string | null) {
	if (correctionCache.size >= maxCacheEntries) {
		const oldestKey = correctionCache.keys().next().value;
		if (oldestKey) {
			correctionCache.delete(oldestKey);
		}
	}

	correctionCache.set(key, correction);
}

function levenshtein(a: string, b: string): number {
	if (a === b) {
		return 0;
	}

	if (a.length === 0) {
		return b.length;
	}

	if (b.length === 0) {
		return a.length;
	}

	const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	const current = new Array<number>(b.length + 1);

	for (let i = 1; i <= a.length; i++) {
		current[0] = i;

		for (let j = 1; j <= b.length; j++) {
			const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
			current[j] = Math.min(
				current[j - 1] + 1,
				previous[j] + 1,
				previous[j - 1] + cost
			);
		}

		for (let j = 0; j <= b.length; j++) {
			previous[j] = current[j];
		}
	}

	return previous[b.length];
}

function applyOriginalCasing(original: string, correction: string): string {
	if (original.toUpperCase() === original) {
		return correction.toUpperCase();
	}

	const firstChar = original.charAt(0);
	if (firstChar.toUpperCase() === firstChar && firstChar.toLowerCase() !== firstChar) {
		return correction.charAt(0).toUpperCase() + correction.slice(1);
	}

	return correction;
}
