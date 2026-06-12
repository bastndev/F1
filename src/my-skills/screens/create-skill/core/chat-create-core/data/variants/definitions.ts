import type { SkillVariantOption } from './types';
import { webVariants } from './01-web/variants';
import { mobileVariants } from './02-mobile/variants';
import { backendVariants } from './03-backend/variants';
import { uiUxVariants } from './04-ui-ux/variants';
import { aiVariants } from './05-ai/variants';
import { testingVariants } from './06-testing/variants';
import { securityVariants } from './07-security/variants';
import { databaseVariants } from './08-database/variants';

export const SKILL_VARIANTS: SkillVariantOption[] = [
	...webVariants,
	...mobileVariants,
	...backendVariants,
	...uiUxVariants,
	...aiVariants,
	...testingVariants,
	...securityVariants,
	...databaseVariants,
];

export const VARIANTS_BY_CATEGORY = SKILL_VARIANTS.reduce((map, variant) => {
	const variants = map.get(variant.categoryId) ?? [];
	variants.push(variant);
	map.set(variant.categoryId, variants);
	return map;
}, new Map<string, SkillVariantOption[]>());

export const VARIANT_BY_CATEGORY_AND_ID = new Map(
	SKILL_VARIANTS.map(variant => [`${variant.categoryId}:${variant.id}`, variant]),
);
