import type { SkillVariantOption } from '../types';

export const webVariants: SkillVariantOption[] = [
	{ id: 'web-design', label: 'Web Design', categoryId: 'web', aliases: ['ui', 'ux', 'design', 'interface', 'visual'], searchTerms: ['web design'], facets: ['design', 'ui'], relatedTechnologyIds: ['react', 'nextjs'], weight: 95 },
	{ id: 'web-styles', label: 'Web Styles', categoryId: 'web', aliases: ['style', 'styles', 'css', 'tailwind', 'theme'], searchTerms: ['tailwind css'], facets: ['css', 'styling'], relatedTechnologyIds: ['tailwind'], weight: 90 },
	{ id: 'react-ui', label: 'React UI', categoryId: 'web', aliases: ['react', 'component', 'components', 'tsx', 'jsx'], searchTerms: ['react'], facets: ['components'], relatedTechnologyIds: ['react'], weight: 88 },
	{ id: 'landing-ui', label: 'Landing UI', categoryId: 'web', aliases: ['landing', 'marketing', 'hero', 'page'], searchTerms: ['landing page design'], facets: ['marketing', 'ui'], weight: 82 },
	{ id: 'accessibility-ui', label: 'Accessibility', categoryId: 'web', aliases: ['accessibility', 'a11y', 'wcag'], searchTerms: ['accessibility'], facets: ['quality'], weight: 78 },
	{ id: 'api-client-ui', label: 'API Client UI', categoryId: 'web', aliases: ['api', 'client', 'dashboard', 'admin'], searchTerms: ['frontend api client'], facets: ['api', 'frontend'], weight: 72 },
];

