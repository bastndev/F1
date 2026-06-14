import type { SkillVariantOption } from '../types';

export const mobileVariants: SkillVariantOption[] = [
	{ id: 'mobile-ui', label: 'Mobile UI', categoryId: 'mobile', aliases: ['ui', 'ux', 'design', 'screen', 'layout'], searchTerms: ['mobile app design'], facets: ['mobile-ui'], weight: 94 },
	{ id: 'mobile-animation', label: 'Animation', categoryId: 'mobile', aliases: ['animation', 'motion', 'gesture'], searchTerms: ['mobile animation'], facets: ['motion'], weight: 84 },
	{ id: 'react-native-ui', label: 'React Native UI', categoryId: 'mobile', aliases: ['react native', 'react-native', 'rn'], searchTerms: ['react native mobile'], facets: ['react-native'], relatedTechnologyIds: ['react-native'], weight: 88 },
	{ id: 'flutter-ui', label: 'Flutter UI', categoryId: 'mobile', aliases: ['flutter', 'dart'], searchTerms: ['flutter dart'], facets: ['flutter'], relatedTechnologyIds: ['flutter'], weight: 86 },
	{ id: 'lynxjs-ui', label: 'LynxJS UI', categoryId: 'mobile', aliases: ['lynx', 'lynxjs', 'lynx js'], searchTerms: ['lynxjs mobile'], facets: ['lynxjs'], relatedTechnologyIds: ['lynxjs'], weight: 80 },
	{ id: 'mobile-forms', label: 'Forms', categoryId: 'mobile', aliases: ['form', 'forms', 'input', 'validation'], searchTerms: ['mobile forms'], facets: ['forms'], weight: 72 },
	{ id: 'offline-mobile', label: 'Offline Flow', categoryId: 'mobile', aliases: ['offline', 'sync', 'storage'], searchTerms: ['mobile offline sync'], facets: ['offline'], weight: 68 },
];
