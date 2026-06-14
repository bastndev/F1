import { DEFAULT_VARIANT_LIMIT, DEFAULT_VARIANT_ORDER } from './defaults';
import { VARIANTS_BY_CATEGORY } from './definitions';
import type { RankedSkillVariant, SkillVariantOption } from './types';

const TOKEN_SPLIT = /[^a-z0-9+#.]+/g;

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/node\.js/g, 'nodejs')
		.replace(/next\.js/g, 'nextjs')
		.replace(/vue\.js/g, 'vue')
		.replace(/[-_]+/g, ' ')
		.trim();
}

function getTokens(value: string): Set<string> {
	return new Set(normalize(value).split(TOKEN_SPLIT).filter(Boolean));
}

function hasSignal(normalizedName: string, tokens: Set<string>, signal: string): boolean {
	const normalizedSignal = normalize(signal);
	if (!normalizedSignal) {
		return false;
	}

	if (normalizedSignal.includes(' ')) {
		return normalizedName.includes(normalizedSignal);
	}

	return tokens.has(normalizedSignal);
}

function scoreVariant(variant: SkillVariantOption, normalizedName: string, tokens: Set<string>): RankedSkillVariant {
	const matchedSignals = variant.aliases.filter(signal => hasSignal(normalizedName, tokens, signal));
	const score = matchedSignals.length > 0
		? matchedSignals.length * 26 + (variant.weight ?? 0)
		: 0;

	return {
		...variant,
		score,
		matchedSignals,
	};
}

export function rankVariantsForCategory(categoryId: string, skillName: string): RankedSkillVariant[] {
	const variants = VARIANTS_BY_CATEGORY.get(categoryId) ?? [];
	const normalizedName = normalize(skillName);
	const tokens = getTokens(skillName);
	const ranked = variants
		.map(variant => scoreVariant(variant, normalizedName, tokens))
		.sort((a, b) => b.score - a.score || (b.weight ?? 0) - (a.weight ?? 0) || a.label.localeCompare(b.label));

	const hasSemanticMatch = ranked.some(variant => variant.score > 0);
	if (!hasSemanticMatch) {
		return [];
	}

	const byId = new Map(ranked.map(variant => [variant.id, variant]));
	const result: RankedSkillVariant[] = [];

	for (const variant of ranked.filter(candidate => candidate.score > 0)) {
		if (result.length >= DEFAULT_VARIANT_LIMIT) {
			break;
		}
		result.push(variant);
	}

	for (const variantId of DEFAULT_VARIANT_ORDER[categoryId] ?? []) {
		if (result.length >= DEFAULT_VARIANT_LIMIT) {
			break;
		}
		if (result.some(variant => variant.id === variantId)) {
			continue;
		}
		const variant = byId.get(variantId);
		if (variant) {
			result.push(variant);
		}
	}

	return result.slice(0, DEFAULT_VARIANT_LIMIT);
}

