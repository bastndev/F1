import type { QueryAnalysis } from './types';
import { QUERY_INTENT_RULES, QUERY_KEYWORDS, type QueryIntentId } from './data/query-intents';

const MAX_DISPLAY_QUERY_LENGTH = 180;
const MAX_ANALYZED_QUERY_LENGTH = 2400;
const MAX_TERMS = 14;
const MIN_ASCII_TERM_LENGTH = 2;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}+#.@_-]*/gu;
const HAN_PATTERN = /[\p{Script=Han}]/u;

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'best',
	'con',
	'de',
	'del',
	'el',
	'en',
	'for',
	'i',
	'la',
	'las',
	'le',
	'lo',
	'los',
	'me',
	'mi',
	'my',
	'need',
	'necesito',
	'o',
	'para',
	'por',
	'project',
	'projects',
	'proyecto',
	'proyectos',
	'que',
	'quiero',
	'skill',
	'skills',
	'the',
	'una',
	'un',
	'use',
	'usar',
	'with',
	'y',
]);

export function analyzeRecommendationQuery(rawQuery: string): QueryAnalysis {
	const normalizedQuery = normalizeQuery(rawQuery);
	const displayQuery = trimForDisplay(normalizedQuery);
	const scannedQuery = normalizedQuery.slice(0, MAX_ANALYZED_QUERY_LENGTH);
	const directTerms = extractTerms(scannedQuery);
	const intentMatches = getIntentMatches(scannedQuery);
	const expandedTerms = expandTerms(directTerms, intentMatches);
	const searchTerms = buildIntentSearchTerms(intentMatches, expandedTerms);
	const isMeaningful = hasMeaningfulSignal(directTerms, expandedTerms, intentMatches.map(intent => intent.id));

	return {
		displayQuery,
		normalizedQuery,
		terms: directTerms,
		expandedTerms,
		intentIds: intentMatches.map(intent => intent.id),
		searchTerms,
		isMeaningful,
	};
}

export function buildSearchPhrase(terms: readonly string[], maxLength = 90): string {
	const phrase = terms
		.map(term => term.trim())
		.filter(Boolean)
		.join(' ')
		.slice(0, maxLength)
		.trim();

	return phrase;
}

function normalizeQuery(value: string): string {
	return value
		.normalize('NFKC')
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function trimForDisplay(value: string): string {
	if (value.length <= MAX_DISPLAY_QUERY_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_DISPLAY_QUERY_LENGTH - 1).trimEnd()}…`;
}

function extractTerms(value: string): string[] {
	const counts = new Map<string, number>();
	const tokens = value.match(TOKEN_PATTERN) ?? [];

	for (const token of tokens) {
		const normalized = normalizeToken(token);
		if (!isUsefulToken(normalized)) {
			continue;
		}

		counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.sort((a, b) => scoreToken(b[0], b[1]) - scoreToken(a[0], a[1]) || a[0].localeCompare(b[0]))
		.slice(0, MAX_TERMS)
		.map(([term]) => term);
}

function getIntentMatches(value: string): Array<{ id: QueryIntentId; searchTerms: string[] }> {
	return QUERY_INTENT_RULES
		.filter(rule => rule.patterns.some(pattern => pattern.test(value)))
		.map(rule => ({
			id: rule.id,
			searchTerms: rule.searchTerms,
		}));
}

function expandTerms(terms: string[], intentMatches: Array<{ id: QueryIntentId; searchTerms: string[] }>): string[] {
	const expanded: string[] = intentMatches.flatMap(intent => intent.searchTerms);

	for (const term of terms) {
		expanded.push(term);
		expanded.push(...QUERY_KEYWORDS[term] ?? []);
	}

	return Array.from(new Set(expanded)).slice(0, MAX_TERMS);
}

function buildIntentSearchTerms(
	intentMatches: Array<{ id: QueryIntentId; searchTerms: string[] }>,
	expandedTerms: string[],
): string[] {
	const searchTerms = intentMatches.flatMap(intent => intent.searchTerms);
	return Array.from(new Set(searchTerms.length > 0 ? searchTerms : expandedTerms)).slice(0, 8);
}

function hasMeaningfulSignal(terms: string[], expandedTerms: string[], intentIds: QueryIntentId[]): boolean {
	if (intentIds.length > 0) {
		return true;
	}

	if (terms.length >= 2) {
		return true;
	}

	if (expandedTerms.length > terms.length) {
		return true;
	}

	return terms.some(term => Boolean(QUERY_KEYWORDS[term]));
}

function normalizeToken(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/^[_#.@-]+|[_#.@-]+$/g, '');
}

function isUsefulToken(value: string): boolean {
	if (!value || STOP_WORDS.has(value)) {
		return false;
	}

	if (HAN_PATTERN.test(value)) {
		return true;
	}

	if (/^\d+$/.test(value)) {
		return false;
	}

	return value.length >= MIN_ASCII_TERM_LENGTH;
}

function scoreToken(term: string, count: number): number {
	const knownBonus = QUERY_KEYWORDS[term] ? 12 : 0;
	const technicalBonus = /[+#.@_-]/.test(term) ? 5 : 0;
	return count * 4 + Math.min(term.length, 14) + knownBonus + technicalBonus;
}
