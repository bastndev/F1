import type { TechnologyOption } from '../types';

export const databaseTechnologies: TechnologyOption[] = [
	{ id: 'prisma', label: 'Prisma', aliases: ['prisma'], searchTerms: ['prisma database'], facets: ['orm'], weight: 94 },
	{ id: 'supabase', label: 'Supabase', aliases: ['supabase'], searchTerms: ['supabase postgres'], facets: ['postgres'], weight: 90 },
	{ id: 'postgres', label: 'Postgres', aliases: ['postgres', 'postgresql'], searchTerms: ['postgres database'], facets: ['sql'], weight: 88 },
	{ id: 'mongodb', label: 'MongoDB', aliases: ['mongo', 'mongodb'], searchTerms: ['mongodb database'], facets: ['nosql'], weight: 80 },
	{ id: 'drizzle', label: 'Drizzle', aliases: ['drizzle', 'drizzle orm'], searchTerms: ['drizzle orm'], facets: ['orm'], weight: 78 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['database'], facets: ['data'], weight: 1 },
];

