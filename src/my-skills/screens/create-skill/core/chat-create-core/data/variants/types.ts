import type { CategoryId, SubcategoryId, SubcategoryOption } from '../categories/types';

export interface SkillVariantOption extends SubcategoryOption {
	id: SubcategoryId;
	label: string;
	categoryId: CategoryId;
	aliases: string[];
	searchTerms: string[];
	facets?: string[];
	weight?: number;
	relatedTechnologyIds?: string[];
}

export interface RankedSkillVariant extends SkillVariantOption {
	score: number;
	matchedSignals: string[];
}

