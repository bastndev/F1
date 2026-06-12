import { CATEGORY_BY_ID } from './definitions';
import { OTHERS_CATEGORY_ID } from './defaults';
import type { CanonicalSearchQuery, CategorySelection } from './types';
import { getVariantBySelection } from '../variants';

const PROJECT_TECH_QUERY_MAP: Record<string, string> = {
	react: 'react',
	nextjs: 'nextjs',
	vue: 'vue',
	svelte: 'svelte',
	astro: 'astro',
	tailwind: 'tailwind css',
	vite: 'vite',
	typescript: 'typescript',
	'vscode-extension': 'vscode extension',
	expo: 'expo react native',
	'react-native': 'react native mobile',
	flutter: 'flutter dart',
	lynxjs: 'lynxjs mobile',
	android: 'android kotlin',
	node: 'nodejs backend',
	fastapi: 'fastapi python api',
	postgres: 'postgres database',
	mongodb: 'mongodb database',
	drizzle: 'drizzle orm',
	playwright: 'playwright testing',
	vitest: 'vitest',
	jest: 'jest testing',
	openai: 'openai',
	langchain: 'langchain',
};

function normalizeQuery(value: string): string {
	return value
		.toLowerCase()
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function buildFallbackQuery(selection: CategorySelection): string {
	const category = selection.categoryId ? CATEGORY_BY_ID.get(selection.categoryId) : undefined;
	if (category) {
		return normalizeQuery(category.label);
	}

	const cleanName = normalizeQuery(selection.skillName ?? '');
	return cleanName || 'skill';
}

export function buildCanonicalSearchQuery(selection: CategorySelection): CanonicalSearchQuery {
	if (selection.categoryId === OTHERS_CATEGORY_ID) {
		return {
			query: '',
			source: 'project',
			categoryId: selection.categoryId,
			facets: [],
		};
	}

	const category = CATEGORY_BY_ID.get(selection.categoryId);
	if (!category) {
		return {
			query: buildFallbackQuery(selection),
			source: 'fallback',
			categoryId: selection.categoryId,
			subcategoryId: selection.subcategoryId ?? undefined,
			facets: [],
		};
	}

	const technology = selection.subcategoryId
		? category.technologies.find(candidate => candidate.id === selection.subcategoryId)
		: undefined;

	const variant = selection.subcategoryId
		? getVariantBySelection(category.id, selection.subcategoryId)
		: undefined;

	if (variant && variant.id !== 'other') {
		return {
			query: normalizeQuery(variant.searchTerms[0] ?? variant.label),
			source: 'variant',
			categoryId: category.id,
			subcategoryId: variant.id,
			facets: variant.facets ?? [],
		};
	}

	if (technology && technology.id !== 'other') {
		return {
			query: normalizeQuery(technology.searchTerms[0] ?? technology.label),
			source: 'technology',
			categoryId: category.id,
			subcategoryId: technology.id,
			facets: technology.facets ?? [],
		};
	}

	const categoryQuery = category.technologies.find(candidate => candidate.id !== 'other')?.searchTerms[0] ?? category.label;
	return {
		query: normalizeQuery(categoryQuery),
		source: 'category',
		categoryId: category.id,
		subcategoryId: selection.subcategoryId ?? undefined,
		facets: category.relations?.flatMap(relation => relation.facets ?? []).slice(0, 3) ?? [],
	};
}

export function buildProjectTechnologyQuery(technologyId: string, searchTerms: string[] = []): CanonicalSearchQuery {
	const mappedQuery = PROJECT_TECH_QUERY_MAP[technologyId];
	const query = mappedQuery ?? searchTerms[0] ?? technologyId;

	return {
		query: normalizeQuery(query),
		source: 'project',
		subcategoryId: technologyId,
		facets: [],
	};
}
