import { searchMarketplaceSkills } from '../../../install-skill/core/marketplace';
import type { InstallMarketplaceSkill } from '../../../install-skill/core/types';
import type { DetectedCombo, DetectedTechnology, InstalledSkillSnapshot, ProjectCategory, QueryAnalysis, SkillCandidate } from './types';
import { isSkillInstalled } from './installed-skills';
import { INTENT_SKILL_RULES, STACK_BONUS_SKILLS, type CuratedSkillRule } from './data/curated-skills';
import { buildSearchPhrase } from './query-analysis';

const MARKETPLACE_QUERY_LIMIT = 80;
const PUBLISHER_MARKETPLACE_QUERY_LIMIT = 150;
const MAX_MARKETPLACE_QUERIES = 5;
const MARKETPLACE_CACHE_TTL_MS = 10 * 60 * 1000;
const MARKETPLACE_CACHE_MAX_ENTRIES = 60;
const BLOCKED_RECOMMENDATION_SKILLS = new Set(['find-skills', 'skill-creator']);
const PUBLISHER_HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/i;
const MIN_STRONG_PUBLISHER_MATCHES = 2;
const marketplaceSearchCache = new Map<string, { expiresAt: number; request: Promise<InstallMarketplaceSkill[]> }>();

interface MarketplaceQuery {
	phrase: string;
	reason: string;
	technologyIds: string[];
	intentIds: QueryAnalysis['intentIds'];
}

export async function getMarketplaceCandidates(
	query: QueryAnalysis,
	technologies: DetectedTechnology[],
	combos: DetectedCombo[],
	installed: InstalledSkillSnapshot,
): Promise<SkillCandidate[]> {
	const localCandidates = getLocalCandidates(query, technologies, combos, installed);
	const marketplaceQueries = buildMarketplaceQueries(query, technologies, combos);
	const remoteResults = await Promise.all(marketplaceQueries.map(entry => searchMarketplace(entry.phrase)));
	const remoteCandidates = remoteResults.flatMap((skills, queryIndex) => {
		const marketplaceQuery = marketplaceQueries[queryIndex];
		if (!marketplaceQuery) {
			return [];
		}

		const queryScore = Math.max(8, 28 - queryIndex * 4);
		return skills
			.filter(skill => !isSkillUnavailable(installed, skill))
			.map((skill): SkillCandidate => ({
				skill,
				score: queryScore + Math.min(18, Math.log10(Math.max(skill.installs, 1)) * 6),
				reasons: [marketplaceQuery.reason],
				technologyIds: marketplaceQuery.technologyIds,
				intentIds: marketplaceQuery.intentIds,
			}));
	});

	return mergeCandidates([...localCandidates, ...remoteCandidates]);
}

export async function getPublisherCandidates(
	publisherQuery: string,
	installed: InstalledSkillSnapshot,
	limit: number,
): Promise<SkillCandidate[]> {
	const normalizedPublisher = normalizePublisherToken(publisherQuery);
	if (!normalizedPublisher) {
		return [];
	}

	const skills = await searchMarketplace(normalizedPublisher, PUBLISHER_MARKETPLACE_QUERY_LIMIT);
	const candidates = skills
		.filter(skill => !isSkillUnavailable(installed, skill))
		.map((skill, index) => createPublisherCandidate(skill, normalizedPublisher, index))
		.filter((candidate): candidate is SkillCandidate => candidate !== undefined);

	const strongMatches = candidates.filter(candidate => isStrongPublisherCandidate(candidate, normalizedPublisher));
	if (strongMatches.length < MIN_STRONG_PUBLISHER_MATCHES) {
		return [];
	}

	return mergeCandidates(strongMatches)
		.sort((a, b) => b.score - a.score || b.skill.installs - a.skill.installs || a.skill.name.localeCompare(b.skill.name))
		.slice(0, limit);
}

export function getPublisherSearchToken(query: QueryAnalysis): string | undefined {
	const explicitToken = getExplicitPublisherToken(query.normalizedQuery);
	if (explicitToken) {
		return explicitToken;
	}

	if (query.intentIds.length > 0 || query.terms.length !== 1) {
		return undefined;
	}

	return normalizePublisherToken(query.terms[0]);
}

export function getLocalCandidates(
	query: QueryAnalysis,
	technologies: DetectedTechnology[],
	combos: DetectedCombo[],
	installed: InstalledSkillSnapshot,
): SkillCandidate[] {
	const candidates: SkillCandidate[] = [];
	const projectCategories = new Set(technologies.flatMap(technology => technology.categories));

	for (const rule of INTENT_SKILL_RULES) {
		if (!rule.intentIds?.some(intentId => query.intentIds.includes(intentId))) {
			continue;
		}

		const candidate = createCuratedCandidate(rule, installed, projectCategories, technologies);
		if (candidate) {
			candidates.push(candidate);
		}
	}

	for (const technology of technologies) {
		if (!isProjectSignalRelevantToQuery(query, technology.categories)) {
			continue;
		}

		for (const skillPath of technology.skills) {
			const skill = createSkillFromPath(skillPath);
			if (!skill || isSkillUnavailable(installed, skill)) {
				continue;
			}

			candidates.push({
				skill,
				score: 80,
				reasons: [`Detected ${technology.name}`],
				technologyIds: [technology.id],
				intentIds: [],
			});
		}
	}

	for (const combo of combos) {
		if (!isProjectSignalRelevantToQuery(query, combo.categories)) {
			continue;
		}

		for (const skillPath of combo.skills) {
			const skill = createSkillFromPath(skillPath);
			if (!skill || isSkillUnavailable(installed, skill)) {
				continue;
			}

			candidates.push({
				skill,
				score: 100,
				reasons: [`Detected ${combo.name}`],
				technologyIds: combo.requires,
				intentIds: [],
			});
		}
	}

	for (const rule of STACK_BONUS_SKILLS) {
		if (!rule.categories?.some(category => projectCategories.has(category))
			|| !isProjectSignalRelevantToQuery(query, rule.categories)) {
			continue;
		}

		const candidate = createCuratedCandidate(rule, installed, projectCategories, technologies);
		if (candidate) {
			candidates.push(candidate);
		}
	}

	return candidates;
}

function createPublisherCandidate(
	skill: InstallMarketplaceSkill,
	publisher: string,
	index: number,
): SkillCandidate | undefined {
	const publisherScore = scorePublisherSkill(skill, publisher);
	if (publisherScore <= 0) {
		return undefined;
	}

	return {
		skill,
		score: publisherScore + Math.max(0, 24 - index),
		reasons: [getPublisherReason(skill, publisher)],
		technologyIds: [],
		intentIds: [],
	};
}

function scorePublisherSkill(skill: InstallMarketplaceSkill, publisher: string): number {
	const source = skill.source.toLowerCase();
	const owner = source.split('/')[0] ?? '';
	const name = skill.name.toLowerCase();
	const skillId = skill.skillId.toLowerCase();
	let score = 0;

	if (owner === publisher) {
		score += 260;
	} else if (source === publisher || source.startsWith(`${publisher}/`)) {
		score += 240;
	} else if (source.includes(publisher)) {
		score += 180;
	} else if (name.includes(publisher) || skillId.includes(publisher)) {
		score += 72;
	}

	score += Math.min(36, Math.log10(Math.max(skill.installs, 1)) * 8);
	return score;
}

function isStrongPublisherCandidate(candidate: SkillCandidate, publisher: string): boolean {
	const source = candidate.skill.source.toLowerCase();
	const owner = source.split('/')[0] ?? '';
	return owner === publisher || source === publisher || source.startsWith(`${publisher}/`) || source.includes(publisher);
}

function getPublisherReason(skill: InstallMarketplaceSkill, publisher: string): string {
	return isStrongPublisherCandidate({ skill, score: 0, reasons: [], technologyIds: [], intentIds: [] }, publisher)
		? `Published by ${publisher}`
		: 'Matched marketplace query';
}

function getExplicitPublisherToken(value: string): string | undefined {
	const normalized = value.trim().toLowerCase();
	const explicitPatterns = [
		/(?:^|\s)@([a-z0-9][a-z0-9._-]{1,62})(?:\s|$)/i,
		/(?:creator|creador|publisher|author|owner|organizacion|organización|organization|org|by|from|de)\s+@?([a-z0-9][a-z0-9._-]{1,62})/i,
		/skills?\s+(?:by|from|de)\s+@?([a-z0-9][a-z0-9._-]{1,62})/i,
	];

	for (const pattern of explicitPatterns) {
		const match = normalized.match(pattern);
		const token = normalizePublisherToken(match?.[1] ?? '');
		if (token) {
			return token;
		}
	}

	return undefined;
}

function normalizePublisherToken(value: string): string | undefined {
	const normalized = value.trim().replace(/^@+/, '').toLowerCase();
	if (!PUBLISHER_HANDLE_PATTERN.test(normalized)) {
		return undefined;
	}

	return normalized;
}

function createCuratedCandidate(
	rule: CuratedSkillRule,
	installed: InstalledSkillSnapshot,
	projectCategories: Set<string>,
	technologies: DetectedTechnology[],
): SkillCandidate | undefined {
	const skill = createSkillFromPath(rule.skill);
	if (!skill || isSkillUnavailable(installed, skill)) {
		return undefined;
	}

	if (rule.estimatedInstalls !== undefined) {
		skill.installs = rule.estimatedInstalls;
	}

	const categoryBoost = rule.categories?.some(category => projectCategories.has(category)) ? 18 : 0;
	const technologyIds = getCuratedTechnologyIds(rule, technologies);
	return {
		skill,
		score: rule.score + categoryBoost,
		reasons: [rule.reason],
		technologyIds,
		intentIds: rule.intentIds ?? [],
	};
}

function getCuratedTechnologyIds(rule: CuratedSkillRule, technologies: DetectedTechnology[]): string[] {
	if (rule.technologyIds) {
		return rule.technologyIds;
	}

	if (!rule.categories || rule.categories.length === 0) {
		return technologies.map(technology => technology.id);
	}

	const ruleCategories = new Set(rule.categories);
	const matched = technologies
		.filter(technology => technology.categories.some(category => ruleCategories.has(category)))
		.map(technology => technology.id);

	return matched.length > 0 ? matched : technologies.map(technology => technology.id);
}

function buildMarketplaceQueries(
	query: QueryAnalysis,
	technologies: DetectedTechnology[],
	combos: DetectedCombo[],
): MarketplaceQuery[] {
	const queries: MarketplaceQuery[] = [];
	const seen = new Set<string>();

	const addQuery = (
		phrase: string,
		reason: string,
		technologyIds: string[] = [],
		intentIds: QueryAnalysis['intentIds'] = [],
	) => {
		const normalizedPhrase = phrase.trim().slice(0, 90);
		if (normalizedPhrase.length < 2) {
			return;
		}

		const key = normalizedPhrase.toLowerCase();
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		queries.push({
			phrase: normalizedPhrase,
			reason,
			technologyIds,
			intentIds,
		});
	};

	const intentPhrase = query.isMeaningful ? buildSearchPhrase(query.searchTerms) : '';
	const userPhrase = query.isMeaningful ? buildSearchPhrase(query.expandedTerms) : '';
	addQuery(intentPhrase, 'Matched your request on skills.sh', [], query.intentIds);
	addQuery(userPhrase, 'Matched your wording on skills.sh', [], query.intentIds);

	for (const combo of combos) {
		if (!isProjectSignalRelevantToQuery(query, combo.categories)) {
			continue;
		}

		for (const term of combo.searchTerms) {
			addQuery(term, `Matched ${combo.name}`, combo.requires);
		}
	}

	for (const technology of technologies) {
		if (!isProjectSignalRelevantToQuery(query, technology.categories)) {
			continue;
		}

		for (const term of technology.searchTerms) {
			addQuery(term, `Matched ${technology.name}`, [technology.id]);
		}
	}

	return queries.slice(0, MAX_MARKETPLACE_QUERIES);
}

function isProjectSignalRelevantToQuery(query: QueryAnalysis, categories: readonly ProjectCategory[]): boolean {
	if (!query.isMeaningful || query.intentIds.length === 0) {
		return true;
	}

	const relevantCategories = getRelevantIntentCategories(query);
	if (relevantCategories.size === 0) {
		return false;
	}

	return categories.some(category => relevantCategories.has(category));
}

function getRelevantIntentCategories(query: QueryAnalysis): Set<ProjectCategory> {
	const categories = new Set<ProjectCategory>();

	for (const intentId of query.intentIds) {
		for (const category of INTENT_RELEVANT_CATEGORIES[intentId] ?? []) {
			categories.add(category);
		}
	}

	return categories;
}

const INTENT_RELEVANT_CATEGORIES: Partial<Record<QueryAnalysis['intentIds'][number], ProjectCategory[]>> = {
	ai: ['ai'],
	backend: ['backend'],
	'code-quality': ['quality', 'language'],
	database: ['database', 'backend'],
	deployment: ['infra', 'backend'],
	design: ['design'],
	docs: ['docs'],
	frontend: ['web'],
	localization: ['docs'],
	mobile: ['mobile'],
	performance: ['web', 'backend'],
	refactor: ['quality', 'language'],
	search: ['quality'],
	security: ['security', 'backend'],
	testing: ['testing'],
	vscode: ['extension'],
};

function searchMarketplace(query: string, limit = MARKETPLACE_QUERY_LIMIT): Promise<InstallMarketplaceSkill[]> {
	pruneExpiredCacheEntries();
	const normalizedLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
	const cacheKey = `${query.toLowerCase()}:${normalizedLimit}`;
	const cached = marketplaceSearchCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.request;
	}

	const request = searchMarketplaceSkills(query, normalizedLimit).catch(() => []);
	marketplaceSearchCache.set(cacheKey, {
		expiresAt: Date.now() + MARKETPLACE_CACHE_TTL_MS,
		request,
	});
	return request;
}

function pruneExpiredCacheEntries(): void {
	const now = Date.now();
	for (const [key, entry] of marketplaceSearchCache) {
		if (entry.expiresAt <= now) {
			marketplaceSearchCache.delete(key);
		}
	}

	if (marketplaceSearchCache.size > MARKETPLACE_CACHE_MAX_ENTRIES) {
		const excess = marketplaceSearchCache.size - MARKETPLACE_CACHE_MAX_ENTRIES;
		const keys = marketplaceSearchCache.keys();
		for (let i = 0; i < excess; i++) {
			const next = keys.next();
			if (!next.done) {
				marketplaceSearchCache.delete(next.value);
			}
		}
	}
}

function isSkillUnavailable(installed: InstalledSkillSnapshot, skill: InstallMarketplaceSkill): boolean {
	return isSkillInstalled(installed, skill.id, skill.skillId) || isBlockedRecommendation(skill);
}

function isBlockedRecommendation(skill: InstallMarketplaceSkill): boolean {
	const candidates = [
		skill.name,
		skill.skillId,
		skill.id.split('/').filter(Boolean).at(-1) ?? '',
	];

	return candidates.some(value => BLOCKED_RECOMMENDATION_SKILLS.has(value.trim().toLowerCase()));
}

export function clearMarketplaceSearchCache(): void {
	marketplaceSearchCache.clear();
}

function mergeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
	const byId = new Map<string, SkillCandidate>();

	for (const candidate of candidates) {
		const existing = byId.get(candidate.skill.id);
		if (!existing) {
			byId.set(candidate.skill.id, candidate);
			continue;
		}

		existing.score = Math.max(existing.score, candidate.score)
			+ Math.min(40, Math.min(existing.score, candidate.score) * 0.5);
		existing.reasons = Array.from(new Set([...existing.reasons, ...candidate.reasons])).slice(0, 3);
		existing.technologyIds = Array.from(new Set([...existing.technologyIds, ...candidate.technologyIds]));
		existing.intentIds = Array.from(new Set([...existing.intentIds, ...candidate.intentIds]));
		existing.skill.installs = Math.max(existing.skill.installs, candidate.skill.installs);
	}

	return Array.from(byId.values());
}

function createSkillFromPath(skillReference: string): InstallMarketplaceSkill | undefined {
	const parsed = parseSkillReference(skillReference);
	if (!parsed) {
		return undefined;
	}

	const name = parsed.skillId.split('/').filter(Boolean).at(-1) ?? parsed.skillId;

	return {
		id: `${parsed.source}/${parsed.skillId}`,
		source: parsed.source,
		skillId: parsed.skillId,
		name,
		installs: 0,
	};
}

function parseSkillReference(value: string): { source: string; skillId: string } | undefined {
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}

	const githubSkill = parseGithubSkillUrl(trimmed);
	if (githubSkill) {
		return githubSkill;
	}

	const atSkillMatch = trimmed.match(/^([^/]+\/[^/@]+)@(.+)$/);
	if (atSkillMatch) {
		const source = atSkillMatch[1]?.trim();
		const skillId = atSkillMatch[2]?.trim();
		return source && skillId ? { source, skillId } : undefined;
	}

	const parts = trimmed.split('/').filter(Boolean);
	if (parts.length < 3) {
		return undefined;
	}

	return {
		source: parts.slice(0, 2).join('/'),
		skillId: parts.slice(2).join('/'),
	};
}

function parseGithubSkillUrl(value: string): { source: string; skillId: string } | undefined {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
			return undefined;
		}

		const parts = url.pathname.split('/').filter(Boolean);
		const [owner, repo] = parts;
		if (!owner || !repo) {
			return undefined;
		}

		const markerIndex = Math.max(parts.indexOf('blob'), parts.indexOf('tree'));
		const pathParts = markerIndex >= 0 ? parts.slice(markerIndex + 2) : parts.slice(2);
		const normalizedPathParts = pathParts.at(-1)?.toLowerCase() === 'skill.md'
			? pathParts.slice(0, -1)
			: pathParts;
		const skillId = normalizedPathParts.at(-1) ?? repo.replace(/\.git$/i, '');

		return {
			source: `${owner}/${repo.replace(/\.git$/i, '')}`,
			skillId,
		};
	} catch {
		return undefined;
	}
}
