export type CategoryId = string;
export type SubcategoryId = string;

export interface CategoryOption {
	id: CategoryId;
	label: string;
	icon: string;
}

export interface SubcategoryOption {
	id: SubcategoryId;
	label: string;
}

export interface CategoryDefinition extends CategoryOption {
	aliases: string[];
	defaultWeight: number;
	technologies: TechnologyOption[];
	relations?: CategoryRelation[];
}

export interface TechnologyOption extends SubcategoryOption {
	aliases: string[];
	searchTerms: string[];
	facets?: string[];
	weight?: number;
}

export interface CategoryRelation {
	categoryId: CategoryId;
	weight: number;
	facets?: string[];
}

export interface RankedCategory extends CategoryOption {
	score: number;
	matchedSignals: string[];
}

export interface CategorySelection {
	categoryId: CategoryId;
	subcategoryId?: SubcategoryId | null;
	skillName?: string;
	description?: string;
}

export interface CanonicalSearchQuery {
	query: string;
	source: 'variant' | 'technology' | 'category' | 'project' | 'fallback';
	categoryId?: CategoryId;
	subcategoryId?: SubcategoryId;
	facets: string[];
}
