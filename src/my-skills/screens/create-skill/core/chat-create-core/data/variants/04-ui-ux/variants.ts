import type { SkillVariantOption } from '../types';

export const uiUxVariants: SkillVariantOption[] = [
	{ id: 'design-system', label: 'Design System', categoryId: 'ui-ux', aliases: ['design system', 'tokens', 'components'], searchTerms: ['design system'], facets: ['system'], weight: 95 },
	{ id: 'visual-polish', label: 'Visual Polish', categoryId: 'ui-ux', aliases: ['polish', 'visual', 'style', 'styles'], searchTerms: ['ui ux design'], facets: ['visual'], weight: 88 },
	{ id: 'accessibility-review', label: 'Accessibility', categoryId: 'ui-ux', aliases: ['accessibility', 'a11y', 'wcag'], searchTerms: ['accessibility'], facets: ['quality'], weight: 84 },
	{ id: 'layout-system', label: 'Layout System', categoryId: 'ui-ux', aliases: ['layout', 'grid', 'responsive'], searchTerms: ['responsive layout design'], facets: ['layout'], weight: 80 },
	{ id: 'motion-design', label: 'Motion Design', categoryId: 'ui-ux', aliases: ['motion', 'animation', 'transition'], searchTerms: ['motion design'], facets: ['motion'], weight: 76 },
	{ id: 'figma-handoff', label: 'Figma Handoff', categoryId: 'ui-ux', aliases: ['figma', 'handoff'], searchTerms: ['figma'], facets: ['handoff'], weight: 72 },
];

