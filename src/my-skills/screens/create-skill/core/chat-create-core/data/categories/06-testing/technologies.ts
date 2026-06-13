import type { TechnologyOption } from '../types';

export const testingTechnologies: TechnologyOption[] = [
	{ id: 'playwright', label: 'Playwright', aliases: ['playwright', 'e2e'], searchTerms: ['playwright testing'], facets: ['e2e'], weight: 95 },
	{ id: 'vitest', label: 'Vitest', aliases: ['vitest'], searchTerms: ['vitest'], facets: ['unit'], weight: 88 },
	{ id: 'jest', label: 'Jest', aliases: ['jest'], searchTerms: ['jest testing'], facets: ['unit'], weight: 84 },
	{ id: 'cypress', label: 'Cypress', aliases: ['cypress'], searchTerms: ['cypress e2e'], facets: ['e2e'], weight: 80 },
	{ id: 'mocha', label: 'Mocha', aliases: ['mocha'], searchTerms: ['mocha testing'], facets: ['unit'], weight: 72 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['testing'], facets: ['quality'], weight: 1 },
];

