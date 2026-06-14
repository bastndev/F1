import type { CategoryRelation } from '../types';

export const backendRelations: CategoryRelation[] = [
	{ categoryId: 'database', weight: 18, facets: ['data'] },
	{ categoryId: 'security', weight: 18, facets: ['auth'] },
	{ categoryId: 'testing', weight: 12, facets: ['api-testing'] },
	{ categoryId: 'web', weight: 8, facets: ['full-stack'] },
];
