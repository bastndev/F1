import type { CategoryRelation } from '../types';

export const webRelations: CategoryRelation[] = [
	{ categoryId: 'ui-ux', weight: 26, facets: ['interface', 'design-system'] },
	{ categoryId: 'testing', weight: 12, facets: ['e2e'] },
	{ categoryId: 'backend', weight: 8, facets: ['api'] },
];

