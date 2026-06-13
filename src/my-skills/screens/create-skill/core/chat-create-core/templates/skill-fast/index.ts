import type { SkillFastTemplate } from './types';
import { webSkillFastTemplates } from './01-web';
import { mobileSkillFastTemplates } from './02-mobile';
import { backendSkillFastTemplates } from './03-backend';
import { uiUxSkillFastTemplates } from './04-ui-ux';
import { aiSkillFastTemplates } from './05-ai';
import { testingSkillFastTemplates } from './06-testing';
import { securitySkillFastTemplates } from './07-security';
import { databaseSkillFastTemplates } from './08-database';

export type { SkillFastReferenceSection, SkillFastTemplate } from './types';
export type { SkillFastVisualBlock, SkillFastVisualBlockKind } from './visual-blocks';
export { getSkillFastArchetypeId, renderSkillFastTemplateBody } from './archetypes';
export { getSkillFastVisualBlockCandidates, getSkillFastVisualBlocks } from './visual-block-presets';
export { renderSkillFastVisualBlock, renderSkillFastVisualBlocks } from './visual-blocks';

const SKILL_FAST_TEMPLATES: SkillFastTemplate[] = [
	...webSkillFastTemplates,
	...mobileSkillFastTemplates,
	...backendSkillFastTemplates,
	...uiUxSkillFastTemplates,
	...aiSkillFastTemplates,
	...testingSkillFastTemplates,
	...securitySkillFastTemplates,
	...databaseSkillFastTemplates,
];

const TEMPLATE_BY_CATEGORY_AND_ID = new Map(
	SKILL_FAST_TEMPLATES.map(template => [`${template.categoryId}:${template.id}`, template]),
);

const FALLBACK_TEMPLATE_BY_CATEGORY = new Map<string, SkillFastTemplate>();
for (const template of SKILL_FAST_TEMPLATES) {
	if (!FALLBACK_TEMPLATE_BY_CATEGORY.has(template.categoryId)) {
		FALLBACK_TEMPLATE_BY_CATEGORY.set(template.categoryId, template);
	}
}

export function getSkillFastTemplate(categoryId?: string, variantId?: string): SkillFastTemplate | undefined {
	if (!categoryId) {
		return undefined;
	}

	if (variantId) {
		const template = TEMPLATE_BY_CATEGORY_AND_ID.get(`${categoryId}:${variantId}`);
		if (template) {
			return template;
		}
	}

	return FALLBACK_TEMPLATE_BY_CATEGORY.get(categoryId);
}

export function formatSkillFastTemplateInstructions(template: SkillFastTemplate): string {
	return template.instructions
		.map((instruction, index) => `${index + 1}. ${instruction}`)
		.join('\n');
}
