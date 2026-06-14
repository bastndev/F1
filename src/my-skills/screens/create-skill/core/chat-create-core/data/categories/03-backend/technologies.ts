import type { TechnologyOption } from '../types';

export const backendTechnologies: TechnologyOption[] = [
	{ id: 'node', label: 'Node.js', aliases: ['node', 'nodejs', 'node.js'], searchTerms: ['nodejs backend'], facets: ['api'], weight: 95 },
	{ id: 'express', label: 'Express', aliases: ['express', 'expressjs'], searchTerms: ['express node'], facets: ['api'], weight: 88 },
	{ id: 'fastify', label: 'Fastify', aliases: ['fastify'], searchTerms: ['fastify node'], facets: ['api'], weight: 84 },
	{ id: 'nestjs', label: 'NestJS', aliases: ['nestjs', 'nest.js', 'nest'], searchTerms: ['nestjs'], facets: ['api'], weight: 82 },
	{ id: 'fastapi', label: 'FastAPI', aliases: ['fastapi'], searchTerms: ['fastapi python api'], facets: ['api', 'python'], weight: 78 },
	{ id: 'auth', label: 'Auth', aliases: ['auth', 'authentication', 'oauth', 'login'], searchTerms: ['auth'], facets: ['security'], weight: 76 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['backend api'], facets: ['api'], weight: 1 },
];

