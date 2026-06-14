import type { CategoryOption } from '../types';

export const securityMeta: CategoryOption & { defaultWeight: number } = {
	id: 'security',
	label: 'Security',
	icon: '🔒',
	defaultWeight: 55,
};

