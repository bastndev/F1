import type { TechnologyOption } from '../types';

export const mobileTechnologies: TechnologyOption[] = [
	{ id: 'react-native', label: 'React Native', aliases: ['react native', 'react-native', 'rn'], searchTerms: ['react native mobile'], facets: ['mobile'], weight: 95 },
	{ id: 'flutter', label: 'Flutter', aliases: ['flutter', 'dart'], searchTerms: ['flutter dart'], facets: ['mobile'], weight: 92 },
	{ id: 'expo', label: 'Expo', aliases: ['expo'], searchTerms: ['expo react native'], facets: ['mobile'], weight: 88 },
	{ id: 'swift', label: 'Swift', aliases: ['swift', 'ios', 'swiftui'], searchTerms: ['swift ios'], facets: ['ios'], weight: 80 },
	{ id: 'lynxjs', label: 'LynxJS', aliases: ['lynx', 'lynxjs', 'lynx js'], searchTerms: ['lynxjs mobile'], facets: ['mobile'], weight: 78 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['mobile app'], facets: ['mobile'], weight: 1 },
];
