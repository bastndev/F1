import type { SkillVariantOption } from '../types';

export const testingVariants: SkillVariantOption[] = [
	{ id: 'e2e-testing', label: 'E2E Testing', categoryId: 'testing', aliases: ['e2e', 'end to end', 'playwright', 'cypress'], searchTerms: ['playwright testing'], facets: ['e2e'], weight: 94 },
	{ id: 'unit-testing', label: 'Unit Testing', categoryId: 'testing', aliases: ['unit', 'vitest', 'jest', 'mocha'], searchTerms: ['vitest'], facets: ['unit'], weight: 88 },
	{ id: 'component-testing', label: 'Component Tests', categoryId: 'testing', aliases: ['component', 'components', 'ui'], searchTerms: ['component testing'], facets: ['components'], weight: 82 },
	{ id: 'api-testing', label: 'API Testing', categoryId: 'testing', aliases: ['api', 'endpoint', 'contract'], searchTerms: ['api testing'], facets: ['api'], weight: 80 },
	{ id: 'accessibility-testing', label: 'Accessibility', categoryId: 'testing', aliases: ['accessibility', 'a11y', 'wcag'], searchTerms: ['accessibility testing'], facets: ['quality'], weight: 76 },
	{ id: 'visual-regression', label: 'Visual Regression', categoryId: 'testing', aliases: ['visual', 'screenshot', 'regression'], searchTerms: ['visual regression testing'], facets: ['visual'], weight: 72 },
];

