import type { TechnologyOption } from '../types';

export const uiUxTechnologies: TechnologyOption[] = [
	{ id: 'figma', label: 'Figma', aliases: ['figma'], searchTerms: ['figma'], facets: ['design'], weight: 92 },
	{ id: 'design-system', label: 'Design System', aliases: ['design system', 'component system', 'tokens'], searchTerms: ['design system'], facets: ['ui'], weight: 90 },
	{ id: 'tailwind', label: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss'], searchTerms: ['tailwind css'], facets: ['css'], weight: 86 },
	{ id: 'accessibility', label: 'Accessibility', aliases: ['accessibility', 'a11y', 'wcag'], searchTerms: ['accessibility'], facets: ['quality'], weight: 82 },
	{ id: 'motion', label: 'Motion', aliases: ['motion', 'animation', 'framer'], searchTerms: ['motion design'], facets: ['animation'], weight: 76 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['ui ux design'], facets: ['design'], weight: 1 },
];

