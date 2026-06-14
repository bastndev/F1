import { CATEGORY_BY_ID, CATEGORY_DEFINITIONS } from './definitions';
import { DEFAULT_CATEGORY_IDS, OTHERS_CATEGORY_ID } from './defaults';
import type { CategoryDefinition, RankedCategory } from './types';

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

function scoreCategory(category: CategoryDefinition, normalizedName: string, tokens: Set<string>): RankedCategory {
	const matchedSignals = category.aliases.filter(signal => hasSignal(normalizedName, tokens, signal));
	const technologyMatches = category.technologies.flatMap(technology => {
		const aliases = technology.aliases.filter(signal => hasSignal(normalizedName, tokens, signal));
		return aliases.map(alias => `${technology.id}:${alias}`);
	});
	const score = matchedSignals.length * 24
		+ technologyMatches.length * 18
		+ (matchedSignals.length > 0 || technologyMatches.length > 0 ? category.defaultWeight : 0);

	return {
		id: category.id,
		label: category.label,
		icon: category.icon,
		score,
		matchedSignals: [...matchedSignals, ...technologyMatches],
	};
}

export function rankCategories(skillName: string): RankedCategory[] {
	const normalizedName = normalize(skillName);
	const tokens = getTokens(skillName);
	const scoreById = new Map<string, RankedCategory>();

	for (const category of CATEGORY_DEFINITIONS) {
		scoreById.set(category.id, scoreCategory(category, normalizedName, tokens));
	}

	const directlyMatchedIds = new Set(
		Array.from(scoreById.values())
			.filter(category => category.score > 0)
			.map(category => category.id),
	);

	for (const category of CATEGORY_DEFINITIONS) {
		const ranked = scoreById.get(category.id);
		if (!ranked || !directlyMatchedIds.has(category.id)) {
			continue;
		}

		for (const relation of category.relations ?? []) {
			const related = scoreById.get(relation.categoryId);
			if (!related) {
				continue;
			}

			related.score += relation.weight;
			related.matchedSignals.push(`${category.id}:relation`);
		}
	}

	const ranked = Array.from(scoreById.values())
		.filter(category => category.score > 0)
		.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

	for (const defaultId of DEFAULT_CATEGORY_IDS) {
		if (ranked.length >= 6) {
			break;
		}

		if (ranked.some(category => category.id === defaultId)) {
			continue;
		}

		const definition = CATEGORY_BY_ID.get(defaultId);
		if (!definition) {
			continue;
		}

		ranked.push({
			id: definition.id,
			label: definition.label,
			icon: definition.icon,
			score: 0,
			matchedSignals: [],
		});
	}

	const topSix = ranked.slice(0, 6);
	topSix.push({
		id: OTHERS_CATEGORY_ID,
		label: 'Others',
		icon: '✨',
		score: 0,
		matchedSignals: [],
	});

	return topSix;
}
