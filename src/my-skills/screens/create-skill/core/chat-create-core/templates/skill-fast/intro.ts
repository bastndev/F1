import type { SkillFastArchetypeId, SkillFastRenderContext, SkillFastTemplate } from './types';
import { getSkillFastArchetypeId } from './archetypes';
import { extractSkillFastIntentSignals, normalizeSkillFastIntent } from './intent-signals';

const CATEGORY_NOUNS: Record<SkillFastArchetypeId, string> = {
	'design-rulebook': 'design execution skill',
	'technical-guide': 'technical implementation skill',
	'workflow-pipeline': 'workflow execution skill',
	'security-playbook': 'security review skill',
	'best-practices': 'review and improvement skill',
	'integration-guide': 'integration execution skill',
	'database-playbook': 'data modeling and migration skill',
	'testing-playbook': 'test strategy skill',
};

const CATEGORY_GUARANTEES: Record<SkillFastArchetypeId, string> = {
	'design-rulebook': 'It exists because visual intent often gets lost during implementation.',
	'technical-guide': 'It exists because implementation quality depends on contracts, local patterns, and failure behavior staying explicit.',
	'workflow-pipeline': 'It exists because multi-step work fails when inputs, checks, and stop conditions are vague.',
	'security-playbook': 'It exists because trust boundaries, authorization, and secrets need concrete verification before convenience.',
	'best-practices': 'It exists because broad advice becomes useful only when it is ranked, evidenced, and actionable.',
	'integration-guide': 'It exists because external contracts, credentials, and failure responses need clear boundaries.',
	'database-playbook': 'It exists because schema and data changes must protect existing records, rollout order, and rollback limits.',
	'testing-playbook': 'It exists because tests should protect observable behavior, not just implementation details.',
};

const CATEGORY_IDENTITIES: Record<SkillFastArchetypeId, string> = {
	'design-rulebook': 'Keep layout, motion, material, accessibility, and component states aligned across every page.',
	'technical-guide': 'Keep inputs, outputs, runtime constraints, and edge cases aligned with the real project.',
	'workflow-pipeline': 'Keep each step tied to evidence, validation, and a clear completion condition.',
	'security-playbook': 'Keep risk triage concrete: who can do what, with which data, and under which checks.',
	'best-practices': 'Keep the output practical: highest-impact issues first, concrete fixes, and clear caveats.',
	'integration-guide': 'Keep provider details typed, validated, and isolated from the rest of the system.',
	'database-playbook': 'Keep models, migrations, indexes, and queries shaped by real access patterns.',
	'testing-playbook': 'Keep coverage focused on user, API, permission, failure, and regression paths.',
};

function compact(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function wordLimit(value: string, maxWords: number): string {
	const words = value.split(/\s+/).filter(Boolean);
	if (words.length <= maxWords) {
		return value;
	}

	return `${words.slice(0, maxWords).join(' ')}.`;
}

export function buildSkillFastIntro(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const archetype = getSkillFastArchetypeId(template);
	const noun = CATEGORY_NOUNS[archetype];
	const scope = `${template.title.toLowerCase()} work`;
	const description = normalizeSkillFastIntent(compact(context.userDescription));
	const signals = extractSkillFastIntentSignals(description, template, context);
	const aestheticIdentity = signals.visualIdentity.slice(0, 4).join(', ');
	const identity = aestheticIdentity
		? `Its output identity is concrete: ${aestheticIdentity}.`
		: CATEGORY_IDENTITIES[archetype];

	return wordLimit([
		`${context.name} is a ${noun} for ${scope}.`,
		CATEGORY_GUARANTEES[archetype],
		identity,
	].join(' '), 60);
}
