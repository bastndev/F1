import { CATEGORY_BY_ID, CATEGORY_DEFINITIONS } from './definitions';
import { OTHERS_CATEGORY_ID } from './defaults';
import { rankCategories } from './ranking';
import type { CategoryOption, SubcategoryOption } from './types';
import { getVariantSubcategories } from '../variants';

export const OTHERS_CATEGORY: CategoryOption = { id: OTHERS_CATEGORY_ID, label: 'Others', icon: '✨' };

export function getDynamicCategories(skillName: string): CategoryOption[] {
	return rankCategories(skillName).map(category => ({
		id: category.id,
		label: category.label,
		icon: category.icon,
	}));
}

export function getSubcategoriesForCategory(categoryId: string, skillName = ''): SubcategoryOption[] {
	if (categoryId === 'others') {
		return [];
	}

	if (skillName.trim()) {
		const variants = getVariantSubcategories(categoryId, skillName);
		if (variants.length > 0) {
			return variants;
		}
	}

	return CATEGORY_BY_ID.get(categoryId)?.technologies.map(technology => ({
		id: technology.id,
		label: technology.label,
	})) ?? [];
}

export function getCategoryDefinitions() {
	return CATEGORY_DEFINITIONS;
}
