import type { CategoryRelation } from '../types';

export const securityRelations: CategoryRelation[] = [
	{ categoryId: 'backend', weight: 16, facets: ['auth'] },
	{ categoryId: 'testing', weight: 8, facets: ['audit'] },
];

