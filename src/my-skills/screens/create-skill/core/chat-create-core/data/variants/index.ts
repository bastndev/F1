import type { SubcategoryOption } from '../categories/types';
import { VARIANT_BY_CATEGORY_AND_ID } from './definitions';
import { rankVariantsForCategory } from './ranking';

export { rankVariantsForCategory } from './ranking';
export type { RankedSkillVariant, SkillVariantOption } from './types';

export function getVariantSubcategories(categoryId: string, skillName: string): SubcategoryOption[] {
	const variants = rankVariantsForCategory(categoryId, skillName);
	if (variants.length === 0) {
		return [];
	}

	return [
		...variants.map(variant => ({
			id: variant.id,
			label: variant.label,
		})),
		{ id: 'other', label: 'Other' },
	];
}

export function getVariantBySelection(categoryId: string, subcategoryId: string) {
	return VARIANT_BY_CATEGORY_AND_ID.get(`${categoryId}:${subcategoryId}`);
}

