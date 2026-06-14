export type { CategoryId, SubcategoryId, CategoryOption, SubcategoryOption } from './categories/types';
import { getDynamicCategories, getSubcategoriesForCategory } from './categories/index';
import type { CategoryOption, SubcategoryOption } from './categories/types';
export { buildCanonicalSearchQuery, buildProjectTechnologyQuery } from './categories/search-query';
export { rankCategories } from './categories/ranking';

// We need to keep some backwards compatibility for places that don't pass a skill name
export function getCategories(skillName?: string): CategoryOption[] {
	if (skillName) {
		return getDynamicCategories(skillName);
	}
	// Default generic fallback
	return getDynamicCategories('');
}

export function getSubcategories(categoryId: string, skillName?: string): SubcategoryOption[] {
	return getSubcategoriesForCategory(categoryId, skillName);
}
