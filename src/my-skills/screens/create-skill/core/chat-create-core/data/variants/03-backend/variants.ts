import type { SkillVariantOption } from '../types';

export const backendVariants: SkillVariantOption[] = [
	{ id: 'api-design', label: 'API Design', categoryId: 'backend', aliases: ['api', 'rest', 'endpoint', 'contract'], searchTerms: ['api design'], facets: ['api'], weight: 95 },
	{ id: 'auth-backend', label: 'Auth Backend', categoryId: 'backend', aliases: ['auth', 'authentication', 'oauth', 'login'], searchTerms: ['auth'], facets: ['security'], weight: 90 },
	{ id: 'database-backend', label: 'Database', categoryId: 'backend', aliases: ['database', 'db', 'postgres', 'prisma'], searchTerms: ['database backend'], facets: ['database'], weight: 82 },
	{ id: 'node-backend', label: 'Node Backend', categoryId: 'backend', aliases: ['node', 'nodejs', 'express', 'fastify', 'nestjs'], searchTerms: ['nodejs backend'], facets: ['node'], relatedTechnologyIds: ['node'], weight: 86 },
	{ id: 'validation-backend', label: 'Validation', categoryId: 'backend', aliases: ['validation', 'schema', 'zod'], searchTerms: ['api validation'], facets: ['validation'], weight: 72 },
	{ id: 'observability-backend', label: 'Observability', categoryId: 'backend', aliases: ['logs', 'logging', 'metrics', 'monitoring'], searchTerms: ['backend observability'], facets: ['observability'], weight: 68 },
];

