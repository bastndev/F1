import type { SkillVariantOption } from '../types';

export const databaseVariants: SkillVariantOption[] = [
	{ id: 'database-schema', label: 'Schema Design', categoryId: 'database', aliases: ['schema', 'model', 'models', 'tables'], searchTerms: ['database schema'], facets: ['schema'], weight: 94 },
	{ id: 'prisma-database', label: 'Prisma', categoryId: 'database', aliases: ['prisma'], searchTerms: ['prisma database'], facets: ['orm'], relatedTechnologyIds: ['prisma'], weight: 92 },
	{ id: 'supabase-database', label: 'Supabase', categoryId: 'database', aliases: ['supabase'], searchTerms: ['supabase postgres'], facets: ['postgres'], relatedTechnologyIds: ['supabase'], weight: 90 },
	{ id: 'postgres-database', label: 'Postgres', categoryId: 'database', aliases: ['postgres', 'postgresql', 'sql'], searchTerms: ['postgres database'], facets: ['sql'], relatedTechnologyIds: ['postgres'], weight: 88 },
	{ id: 'mongodb-database', label: 'MongoDB', categoryId: 'database', aliases: ['mongo', 'mongodb', 'nosql'], searchTerms: ['mongodb database'], facets: ['nosql'], relatedTechnologyIds: ['mongodb'], weight: 80 },
	{ id: 'database-migrations', label: 'Migrations', categoryId: 'database', aliases: ['migration', 'migrations', 'versioning'], searchTerms: ['database migrations'], facets: ['schema'], weight: 78 },
];

