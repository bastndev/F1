import type { InstallMarketplaceSkill } from '../../../install-skill/core/types';
import type { QueryIntentId } from './data/query-intents';

import type { DetectedCombo, DetectedTechnology, ProjectAnalysis, ProjectCategory } from '../shared/project-analyzer/types';
export type { DetectedCombo, DetectedTechnology, ProjectAnalysis, ProjectCategory };

export interface InstalledSkillSnapshot {
	ids: Set<string>;
	names: Set<string>;
}

export interface SkillCandidate {
	skill: InstallMarketplaceSkill;
	score: number;
	reasons: string[];
	technologyIds: string[];
	intentIds: QueryIntentId[];
}

export interface RecommendedSkill {
	skill: InstallMarketplaceSkill;
	reasons: string[];
	technologyIds: string[];
	score: number;
}

export type SearchResultKind = 'recommendations' | 'publisher';

export interface SearchRecommendationRequest {
	query: string;
	limit?: number;
}

export interface QueryAnalysis {
	displayQuery: string;
	normalizedQuery: string;
	terms: string[];
	expandedTerms: string[];
	intentIds: QueryIntentId[];
	searchTerms: string[];
	isMeaningful: boolean;
}

export interface SearchRecommendationResult {
	query: string;
	resultKind: SearchResultKind;
	title: string;
	kicker: string;
	technologies: DetectedTechnology[];
	combos: DetectedCombo[];
	categories: ProjectCategory[];
	recommendations: RecommendedSkill[];
}
