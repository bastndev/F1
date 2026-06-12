import type { InstallMarketplaceSkill } from '../panels/trending-skill/install-item';

const collections = new Map<string, InstallMarketplaceSkill[]>();
const STORE_EVENT = 'install-skill-store:update';

export function setSkillCollection(key: string, skills: InstallMarketplaceSkill[]): void {
	collections.set(key, skills);
	window.dispatchEvent(new CustomEvent(STORE_EVENT));
}

export function getSkillCollection(key: string): InstallMarketplaceSkill[] {
	return collections.get(key) || [];
}

export function removeSkillFromCollections(id: string): void {
	let didChange = false;

	collections.forEach((skills) => {
		const index = skills.findIndex(skill => skill.id === id);
		if (index !== -1) {
			skills.splice(index, 1);
			didChange = true;
		}
	});

	if (didChange) {
		window.dispatchEvent(new CustomEvent(STORE_EVENT));
	}
}

export function onSkillStoreUpdate(listener: () => void): () => void {
	window.addEventListener(STORE_EVENT, listener);
	return () => window.removeEventListener(STORE_EVENT, listener);
}

interface SearchOptions {
	keys?: string[];
	keyPrefix?: string;
}

export function searchCachedSkills(query: string, limit = 80, options: SearchOptions = {}): InstallMarketplaceSkill[] {
	const terms = query.trim().toLowerCase().split(/\s+/g).filter(Boolean);
	if (terms.length === 0) {
		return [];
	}

	return getCachedSkills(options)
		.map(skill => ({ skill, score: scoreSkill(skill, terms) }))
		.filter(entry => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.skill.installs - a.skill.installs)
		.slice(0, limit)
		.map(entry => entry.skill);
}

export function mergeSkillResults(
	primary: InstallMarketplaceSkill[],
	secondary: InstallMarketplaceSkill[],
	limit = 120,
): InstallMarketplaceSkill[] {
	const seen = new Set<string>();
	const merged: InstallMarketplaceSkill[] = [];

	for (const skill of [...primary, ...secondary]) {
		if (seen.has(skill.id)) {
			continue;
		}

		seen.add(skill.id);
		merged.push(skill);
		if (merged.length >= limit) {
			break;
		}
	}

	return merged;
}

function getCachedSkills(options: SearchOptions): InstallMarketplaceSkill[] {
	const seen = new Set<string>();
	const skills: InstallMarketplaceSkill[] = [];
	const requestedKeys = options.keys ? new Set(options.keys) : undefined;

	collections.forEach((collection, key) => {
		if (requestedKeys && !requestedKeys.has(key)) {
			return;
		}

		if (options.keyPrefix && !key.startsWith(options.keyPrefix)) {
			return;
		}

		for (const skill of collection) {
			if (seen.has(skill.id)) {
				continue;
			}

			seen.add(skill.id);
			skills.push(skill);
		}
	});

	return skills;
}

function scoreSkill(skill: InstallMarketplaceSkill, terms: string[]): number {
	const name = skill.name.toLowerCase();
	const skillId = skill.skillId.toLowerCase();
	const source = skill.source.toLowerCase();
	let score = 0;

	for (const term of terms) {
		if (name === term || skillId === term) {
			score += 100;
		} else if (name.startsWith(term) || skillId.startsWith(term)) {
			score += 62;
		} else if (name.includes(term) || skillId.includes(term)) {
			score += 38;
		} else if (source.includes(term)) {
			score += 18;
		}
	}

	return score;
}
