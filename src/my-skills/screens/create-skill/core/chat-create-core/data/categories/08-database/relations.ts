import type { CategoryRelation } from '../types';

export const databaseRelations: CategoryRelation[] = [
	{ categoryId: 'backend', weight: 20, facets: ['api'] },
	{ categoryId: 'security', weight: 8, facets: ['data-protection'] },
	{ categoryId: 'testing', weight: 6, facets: ['data-tests'] },
];

