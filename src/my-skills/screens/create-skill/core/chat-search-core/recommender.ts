import type { ProjectAnalysis, QueryAnalysis, RecommendedSkill, SkillCandidate } from './types';

const SOURCE_TRUST_SCORES: Record<string, number> = {
	anthropics: 34,
	antfu: 22,
	astrolicious: 18,
	cloudflare: 30,
	'currents-dev': 18,
	expo: 28,
	microsoft: 34,
	openai: 32,
	prisma: 26,
	supabase: 26,
	'sveltejs': 24,
	'vercel-labs': 34,
	wshobson: 20,
};

export function rankRecommendations(
	candidates: SkillCandidate[],
	analysis: ProjectAnalysis,
	query: QueryAnalysis,
	limit: number,
): RecommendedSkill[] {
	const detectedIds = new Set(analysis.technologies.map(technology => technology.id));

	return candidates
		.map(candidate => ({
			...candidate,
			score: candidate.score
				+ scoreIntentMatch(candidate, query)
				+ scoreQueryMatch(candidate, query)
				+ scoreTechnologyMatch(candidate, detectedIds)
				+ scoreSignalBreadth(candidate)
				+ scoreSourceTrust(candidate)
				+ scoreInstallQuality(candidate)
				+ scoreGenericPenalty(candidate, query),
			rankedReasons: buildRecommendationReasons(candidate),
		}))
		.sort((a, b) => b.score - a.score || b.skill.installs - a.skill.installs || a.skill.name.localeCompare(b.skill.name))
		.slice(0, limit)
		.map(candidate => ({
			skill: candidate.skill,
			reasons: candidate.rankedReasons.slice(0, 2),
			technologyIds: candidate.technologyIds,
			score: Math.round(candidate.score),
		}));
}

function scoreIntentMatch(candidate: SkillCandidate, query: QueryAnalysis): number {
	if (query.intentIds.length === 0 || candidate.intentIds.length === 0) {
		return 0;
	}

	const matchCount = candidate.intentIds.filter(intentId => query.intentIds.includes(intentId)).length;
	return matchCount > 0 ? 76 + Math.min(32, (matchCount - 1) * 16) : 0;
}

function scoreQueryMatch(candidate: SkillCandidate, query: QueryAnalysis): number {
	if (!query.isMeaningful || query.expandedTerms.length === 0) {
		return 0;
	}

	const haystack = `${candidate.skill.name} ${candidate.skill.skillId} ${candidate.skill.source} ${candidate.reasons.join(' ')}`.toLowerCase();
	return query.expandedTerms.reduce((score, term) => score + (haystack.includes(term) ? 24 : 0), 0);
}

function scoreTechnologyMatch(candidate: SkillCandidate, detectedIds: Set<string>): number {
	return candidate.technologyIds.reduce((score, id) => score + (detectedIds.has(id) ? 18 : 0), 0);
}

function scoreSignalBreadth(candidate: SkillCandidate): number {
	const signalCount = new Set([...candidate.technologyIds, ...candidate.intentIds]).size;
	return Math.min(28, signalCount * 7);
}

function scoreSourceTrust(candidate: SkillCandidate): number {
	const owner = candidate.skill.source.split('/')[0]?.toLowerCase() ?? '';
	return SOURCE_TRUST_SCORES[owner] ?? 0;
}

function scoreInstallQuality(candidate: SkillCandidate): number {
	const installs = candidate.skill.installs;
	if (installs >= 100000) {
		return 28;
	}
	if (installs >= 10000) {
		return 22;
	}
	if (installs >= 1000) {
		return 16;
	}
	if (installs >= 100) {
		return 8;
	}

	return 0;
}

function scoreGenericPenalty(candidate: SkillCandidate, query: QueryAnalysis): number {
	if (query.intentIds.length === 0 || candidate.intentIds.length > 0) {
		return 0;
	}

	return scoreQueryMatch(candidate, query) > 0 ? 0 : -36;
}

function buildRecommendationReasons(candidate: SkillCandidate): string[] {
	const reasons = [...candidate.reasons];
	const qualityReason = getQualityReason(candidate);
	if (qualityReason) {
		reasons.push(qualityReason);
	}

	return Array.from(new Set(reasons));
}

function getQualityReason(candidate: SkillCandidate): string | undefined {
	if (scoreSourceTrust(candidate) >= 30) {
		return 'Trusted source';
	}

	if (candidate.skill.installs >= 1000) {
		return 'Popular on skills.sh';
	}

	return undefined;
}
