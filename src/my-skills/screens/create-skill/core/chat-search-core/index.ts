import { getProjectAnalysis } from '../shared/project-analyzer';
import { clearCachedProjectAnalysis } from '../shared/project-analyzer/cache';
import { getInstalledSkillSnapshot } from './installed-skills';
import { clearMarketplaceSearchCache, getLocalCandidates, getMarketplaceCandidates, getPublisherCandidates, getPublisherSearchToken } from './marketplace-match';
import { analyzeRecommendationQuery } from './query-analysis';
import { rankRecommendations } from './recommender';
import type { DetectedTechnology, ProjectAnalysis, ProjectCategory, QueryAnalysis, RecommendedSkill, SearchRecommendationRequest, SearchRecommendationResult, SkillCandidate } from './types';

const DEFAULT_RECOMMENDATION_LIMIT = 5;
const PUBLISHER_RECOMMENDATION_LIMIT = 50;

export async function getSearchRecommendations(
	request: SearchRecommendationRequest,
): Promise<SearchRecommendationResult> {
	const queryAnalysis = analyzeRecommendationQuery(request.query);
	const limit = Math.min(Math.max(1, Math.floor(request.limit ?? DEFAULT_RECOMMENDATION_LIMIT)), 8);
	const installed = await getInstalledSkillSnapshot();
	const publisherQuery = getPublisherSearchToken(queryAnalysis);
	if (publisherQuery) {
		const publisherLimit = Math.max(limit, PUBLISHER_RECOMMENDATION_LIMIT);
		const publisherCandidates = await getPublisherCandidates(publisherQuery, installed, publisherLimit);
		if (publisherCandidates.length > 0) {
			return createPublisherRecommendationResult(queryAnalysis, publisherQuery, publisherCandidates);
		}
	}

	const analysis = await getProjectAnalysis();
	const candidates = await getMarketplaceCandidates(queryAnalysis, analysis.technologies, analysis.combos, installed);
	return computeRecommendations(queryAnalysis, candidates, limit, analysis);
}

export async function getSearchRecommendationPreview(
	request: SearchRecommendationRequest,
): Promise<SearchRecommendationResult> {
	const queryAnalysis = analyzeRecommendationQuery(request.query);
	if (getPublisherSearchToken(queryAnalysis)) {
		return createEmptyRecommendationResult(queryAnalysis);
	}

	const limit = Math.min(Math.max(1, Math.floor(request.limit ?? DEFAULT_RECOMMENDATION_LIMIT)), 8);
	const analysis = await getProjectAnalysis();
	const installed = await getInstalledSkillSnapshot();
	const candidates = getLocalCandidates(queryAnalysis, analysis.technologies, analysis.combos, installed);
	return computeRecommendations(queryAnalysis, candidates, limit, analysis);
}

async function computeRecommendations(
	queryAnalysis: QueryAnalysis,
	candidates: SkillCandidate[],
	limit: number,
	analysis: ProjectAnalysis,
): Promise<SearchRecommendationResult> {
	const recommendations = rankRecommendations(candidates, analysis, queryAnalysis, limit);
	return createRecommendationResult(queryAnalysis, analysis, recommendations);
}

export async function prewarmSearchRecommendations(): Promise<void> {
	await getProjectAnalysis();
}

function createPublisherRecommendationResult(
	query: QueryAnalysis,
	publisher: string,
	candidates: SkillCandidate[],
): SearchRecommendationResult {
	return {
		query: query.displayQuery,
		resultKind: 'publisher',
		title: `Skills by ${publisher}`,
		kicker: 'Marketplace',
		technologies: [],
		combos: [],
		categories: [],
		recommendations: candidates.map(candidate => ({
			skill: candidate.skill,
			reasons: candidate.reasons.slice(0, 2),
			technologyIds: candidate.technologyIds,
			score: Math.round(candidate.score),
		})),
	};
}

function createEmptyRecommendationResult(query: QueryAnalysis): SearchRecommendationResult {
	return {
		query: query.displayQuery,
		resultKind: 'recommendations',
		title: 'Best skills for your project...',
		kicker: 'Recommended',
		technologies: [],
		combos: [],
		categories: [],
		recommendations: [],
	};
}

function createRecommendationResult(
	query: QueryAnalysis,
	analysis: ProjectAnalysis,
	recommendations: RecommendedSkill[],
): SearchRecommendationResult {
	return {
		query: query.displayQuery,
		resultKind: 'recommendations',
		title: 'Best skills for your project...',
		kicker: 'Recommended',
		technologies: selectDisplayTechnologies(analysis, query, recommendations),
		combos: analysis.combos,
		categories: analysis.categories,
		recommendations,
	};
}

function selectDisplayTechnologies(
	analysis: ProjectAnalysis,
	query: QueryAnalysis,
	recommendations: RecommendedSkill[],
): DetectedTechnology[] {
	if (!query.isMeaningful || query.intentIds.length === 0) {
		return analysis.technologies.slice(0, 3);
	}

	const intentTags = createIntentDisplayTechnologies(query);
	if (intentTags.length > 0) {
		return intentTags;
	}

	const intentCategories = getIntentCategories(query);
	const recommendedTechnologyIds = new Set(recommendations.flatMap(recommendation => recommendation.technologyIds));
	const relevantTechnologies = analysis.technologies.filter(technology => {
		return recommendedTechnologyIds.has(technology.id)
			|| technology.categories.some(category => intentCategories.has(category));
	});

	return (relevantTechnologies.length > 0 ? relevantTechnologies : analysis.technologies).slice(0, 3);
}

function createIntentDisplayTechnologies(query: QueryAnalysis): DetectedTechnology[] {
	const names = query.intentIds.flatMap(intentId => INTENT_DISPLAY_TAGS[intentId] ?? []);
	const uniqueNames = Array.from(new Set(names)).slice(0, 3);
	const categories = Array.from(getIntentCategories(query));

	return uniqueNames.map((name, index) => ({
		id: `intent-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
		name,
		categories,
		sources: [],
		skills: [],
		searchTerms: [],
	}));
}

function getIntentCategories(query: QueryAnalysis): Set<ProjectCategory> {
	const categories = new Set<ProjectCategory>();

	for (const intentId of query.intentIds) {
		for (const category of INTENT_CATEGORY_MAP[intentId] ?? []) {
			categories.add(category);
		}
	}

	return categories;
}

const INTENT_CATEGORY_MAP: Record<string, ProjectCategory[]> = {
	ai: ['ai', 'tooling'],
	backend: ['backend'],
	'code-quality': ['quality', 'tooling', 'language'],
	database: ['database', 'backend'],
	deployment: ['infra', 'backend', 'web'],
	design: ['design', 'web'],
	docs: ['docs'],
	frontend: ['web'],
	localization: ['docs', 'tooling'],
	mobile: ['mobile'],
	performance: ['web', 'backend'],
	refactor: ['quality', 'tooling', 'language'],
	search: ['ai', 'tooling'],
	security: ['security', 'backend'],
	testing: ['testing'],
	vscode: ['extension', 'tooling'],
};

const INTENT_DISPLAY_TAGS: Record<string, string[]> = {
	ai: ['AI', 'Agents', 'Automation'],
	backend: ['Backend', 'API', 'Server'],
	'code-quality': ['Code Quality', 'TypeScript', 'Linting'],
	database: ['Database', 'Prisma', 'Supabase'],
	deployment: ['Deploy', 'Production', 'Cloud'],
	design: ['UI/UX', 'Design', 'Accessibility'],
	docs: ['Docs', 'README', 'Guides'],
	frontend: ['Frontend', 'Web', 'UI'],
	localization: ['Localization', 'i18n', 'Translation'],
	mobile: ['Mobile', 'Native UI', 'Apps'],
	performance: ['Performance', 'Optimization', 'Web Perf'],
	refactor: ['Refactor', 'Architecture', 'Quality'],
	search: ['Search', 'Discovery', 'Recommendations'],
	security: ['Security', 'Auth', 'Safety'],
	testing: ['Testing', 'Playwright', 'Vitest'],
	vscode: ['VS Code', 'Webview', 'Extension'],
};

export function clearSearchRecommendationCache(): void {
	clearCachedProjectAnalysis();
	clearMarketplaceSearchCache();
}

export type { RecommendedSkill, SearchRecommendationResult } from './types';
