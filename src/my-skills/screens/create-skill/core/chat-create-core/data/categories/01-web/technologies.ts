import type { TechnologyOption } from '../types';

export const webTechnologies: TechnologyOption[] = [
	{ id: 'react', label: 'React', aliases: ['react', 'reactjs', 'jsx', 'tsx'], searchTerms: ['react'], facets: ['frontend'], weight: 95 },
	{ id: 'nextjs', label: 'Next.js', aliases: ['next', 'nextjs', 'next.js'], searchTerms: ['nextjs'], facets: ['react', 'framework'], weight: 92 },
	{ id: 'vue', label: 'Vue', aliases: ['vue', 'vuejs', 'vue.js', 'nuxt'], searchTerms: ['vue'], facets: ['frontend'], weight: 88 },
	{ id: 'astro', label: 'Astro', aliases: ['astro'], searchTerms: ['astro'], facets: ['frontend', 'static-site'], weight: 82 },
	{ id: 'svelte', label: 'Svelte', aliases: ['svelte', 'sveltekit'], searchTerms: ['svelte'], facets: ['frontend'], weight: 80 },
	{ id: 'angular', label: 'Angular', aliases: ['angular'], searchTerms: ['angular'], facets: ['frontend'], weight: 72 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['web frontend'], facets: ['frontend'], weight: 1 },
];

