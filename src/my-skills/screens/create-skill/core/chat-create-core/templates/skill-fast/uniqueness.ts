import type { SkillFastArchetypeId, SkillFastRenderContext, SkillFastTemplate } from './types';
import { extractSkillFastIntentSignals, normalizeSkillFastIntent } from './intent-signals';

interface LensOption {
	title: string;
	summary: string;
	priorities: string[];
	avoidances: string[];
}

export interface SkillFastUniqueProfile {
	sectionTitle: string;
	summary: string;
	anchors: string[];
	priorities: string[];
	avoidances: string[];
}

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'in',
	'is',
	'it',
	'of',
	'on',
	'or',
	'that',
	'the',
	'this',
	'to',
	'use',
	'with',
	'when',
	'para',
	'con',
	'por',
	'que',
	'una',
	'uno',
	'los',
	'las',
	'del',
	'esta',
	'este',
	'como',
]);

const ARCHETYPE_SECTION_TITLES: Record<SkillFastArchetypeId, string> = {
	'design-rulebook': 'Design Lens',
	'technical-guide': 'Technical Lens',
	'workflow-pipeline': 'Workflow Lens',
	'security-playbook': 'Security Lens',
	'best-practices': 'Review Lens',
	'integration-guide': 'Integration Lens',
	'database-playbook': 'Data Lens',
	'testing-playbook': 'Test Lens',
};

const LENS_OPTIONS: Record<SkillFastArchetypeId, LensOption[]> = {
	'design-rulebook': [
		{
			title: 'Context-first visual direction',
			summary: 'Shape the result around the product context before choosing style, motion, or layout details.',
			priorities: ['Product intent', 'visual hierarchy', 'responsive constraints'],
			avoidances: ['decorative changes without user value', 'theme drift', 'layout instability'],
		},
		{
			title: 'Interaction clarity',
			summary: 'Treat every visual decision as part of an interaction path the user must understand quickly.',
			priorities: ['primary action clarity', 'state visibility', 'keyboard and pointer behavior'],
			avoidances: ['hidden affordances', 'unclear selected states', 'motion that obscures status'],
		},
		{
			title: 'Distinct but usable',
			summary: 'Make the surface memorable while keeping density, readability, and accessibility under control.',
			priorities: ['memorable composition', 'readable contrast', 'controlled density'],
			avoidances: ['generic AI aesthetics', 'overcrowded effects', 'text overflow'],
		},
	],
	'technical-guide': [
		{
			title: 'Contract-first implementation',
			summary: 'Start from the public contract and then work inward through types, state, and edge cases.',
			priorities: ['input/output shape', 'failure states', 'local architecture'],
			avoidances: ['implicit contracts', 'untyped assumptions', 'happy-path-only changes'],
		},
		{
			title: 'Project-pattern alignment',
			summary: 'Prefer the repository’s existing boundaries and helpers before introducing new structure.',
			priorities: ['nearby patterns', 'minimal surface area', 'clear ownership'],
			avoidances: ['one-off abstractions', 'framework drift', 'duplicate logic'],
		},
		{
			title: 'Runtime-aware changes',
			summary: 'Check the runtime, platform, and lifecycle before choosing implementation details.',
			priorities: ['runtime constraints', 'state lifecycle', 'observable behavior'],
			avoidances: ['unsupported APIs', 'hidden global state', 'unhandled async paths'],
		},
	],
	'workflow-pipeline': [
		{
			title: 'Checkpointed execution',
			summary: 'Break the workflow into verifiable checkpoints and stop when required state is missing.',
			priorities: ['input validation', 'step verification', 'safe stop conditions'],
			avoidances: ['unbounded loops', 'blind continuation', 'unverified intermediate output'],
		},
		{
			title: 'Tool-aware orchestration',
			summary: 'Choose tools based on the workflow boundary and validate each tool result before proceeding.',
			priorities: ['tool contracts', 'result validation', 'fallback paths'],
			avoidances: ['tool overuse', 'silent partial failure', 'missing approvals'],
		},
		{
			title: 'Outcome traceability',
			summary: 'Keep the workflow explainable by preserving inputs, decisions, and final evidence.',
			priorities: ['decision records', 'source evidence', 'clear completion criteria'],
			avoidances: ['opaque summaries', 'lost context', 'unattributed claims'],
		},
	],
	'security-playbook': [
		{
			title: 'Trust-boundary first',
			summary: 'Map who can call what, with which identity, and where trust changes before proposing fixes.',
			priorities: ['auth boundary', 'authorization checks', 'data exposure'],
			avoidances: ['client-only enforcement', 'token leakage', 'bypass paths'],
		},
		{
			title: 'Exploitability ranking',
			summary: 'Prioritize findings by concrete exploit path, impact, and likelihood instead of abstract risk.',
			priorities: ['proof path', 'impact', 'remediation leverage'],
			avoidances: ['theoretical noise', 'severity inflation', 'unverified assumptions'],
		},
		{
			title: 'Least privilege',
			summary: 'Reduce access, scope, and sensitive data movement while preserving required behavior.',
			priorities: ['minimal scopes', 'safe defaults', 'auditability'],
			avoidances: ['broad permissions', 'secret sprawl', 'silent privilege changes'],
		},
	],
	'best-practices': [
		{
			title: 'Impact ordering',
			summary: 'Address the highest-impact correctness, performance, usability, or maintainability issue first.',
			priorities: ['severity', 'evidence', 'actionability'],
			avoidances: ['style-only churn', 'unranked findings', 'generic advice'],
		},
		{
			title: 'Rule-backed review',
			summary: 'Ground recommendations in explicit rules and local evidence so each finding is defensible.',
			priorities: ['rule match', 'file evidence', 'practical fix'],
			avoidances: ['unsupported claims', 'overbroad rewrites', 'missing tests'],
		},
		{
			title: 'Pragmatic improvement',
			summary: 'Prefer changes that improve the current artifact without expanding scope unnecessarily.',
			priorities: ['small fixes', 'clear tradeoffs', 'safe rollout'],
			avoidances: ['architecture theater', 'large unrelated refactors', 'ambiguous wins'],
		},
	],
	'integration-guide': [
		{
			title: 'Boundary mapping',
			summary: 'Identify every external contract, credential, schema, and failure response before implementation.',
			priorities: ['API contract', 'credential boundary', 'error handling'],
			avoidances: ['client-side secrets', 'unvalidated responses', 'missing setup steps'],
		},
		{
			title: 'Operational setup',
			summary: 'Make setup, environment, retries, and diagnostics part of the integration instead of afterthoughts.',
			priorities: ['configuration', 'observability', 'retry/fallback behavior'],
			avoidances: ['hidden prerequisites', 'silent failure', 'manual-only setup'],
		},
		{
			title: 'Type-safe handoff',
			summary: 'Keep data crossing the integration boundary typed, validated, and easy to consume downstream.',
			priorities: ['schema validation', 'typed adapters', 'consumer expectations'],
			avoidances: ['shape guessing', 'leaky provider details', 'fragile parsing'],
		},
	],
	'database-playbook': [
		{
			title: 'Data integrity first',
			summary: 'Design the change around correctness of existing and future data before optimizing convenience.',
			priorities: ['constraints', 'relationships', 'migration safety'],
			avoidances: ['destructive shortcuts', 'orphaned records', 'implicit invariants'],
		},
		{
			title: 'Access-pattern modeling',
			summary: 'Let real reads, writes, filters, and joins drive models, indexes, and query shape.',
			priorities: ['query paths', 'index fit', 'transaction boundaries'],
			avoidances: ['unused indexes', 'N+1 behavior', 'schema without usage context'],
		},
		{
			title: 'Rollout-aware data changes',
			summary: 'Plan schema and data changes so deployment, backfill, validation, and rollback are explicit.',
			priorities: ['deploy order', 'backfill plan', 'rollback limits'],
			avoidances: ['one-shot risky migrations', 'unverified data movement', 'downtime assumptions'],
		},
	],
	'testing-playbook': [
		{
			title: 'Behavior contract',
			summary: 'Test the behavior callers or users depend on rather than implementation details.',
			priorities: ['observable behavior', 'edge cases', 'failure modes'],
			avoidances: ['brittle internals', 'timing assumptions', 'fixture leakage'],
		},
		{
			title: 'Regression shield',
			summary: 'Choose cases that protect the most likely or most expensive future regressions.',
			priorities: ['critical path', 'previous failures', 'deterministic setup'],
			avoidances: ['low-value snapshots', 'random data', 'untested permissions'],
		},
		{
			title: 'Runner-native coverage',
			summary: 'Use the project’s existing runner, fixtures, and helpers so tests fit the codebase.',
			priorities: ['local test style', 'stable selectors', 'clear assertions'],
			avoidances: ['new test frameworks', 'manual-only checks', 'overmocking'],
		},
	],
};

const DECISION_BIASES: Record<SkillFastArchetypeId, string[]> = {
	'design-rulebook': [
		'Choose layout and interaction decisions before visual decoration.',
		'Let the most important user action control hierarchy, spacing, and state treatment.',
		'Favor a distinct product mood only when readability and control states stay clear.',
	],
	'technical-guide': [
		'Start from the contract, then adapt implementation details to the local architecture.',
		'Prefer the smallest code path that makes behavior explicit and observable.',
		'Use runtime constraints to decide where validation, state, and side effects belong.',
	],
	'workflow-pipeline': [
		'Keep every step tied to an input, output, validation point, or stop condition.',
		'Prefer resumable checkpoints over long unverified execution.',
		'Make tool choice depend on the workflow boundary and available evidence.',
	],
	'security-playbook': [
		'Rank decisions by exploitability, data exposure, and trust-boundary impact.',
		'Prefer safer defaults even when the convenient path is shorter.',
		'Make auth, secret handling, and auditability explicit before polish.',
	],
	'best-practices': [
		'Rank findings by practical impact before style or preference.',
		'Tie every recommendation to local evidence, a rule, or a measurable effect.',
		'Prefer targeted fixes that improve the artifact without widening scope.',
	],
	'integration-guide': [
		'Map external contracts before choosing adapters, storage, or UI flow.',
		'Treat credentials, rate limits, and failure responses as first-class design inputs.',
		'Keep provider-specific details behind typed and validated boundaries.',
	],
	'database-playbook': [
		'Let existing and future data integrity drive schema and migration decisions.',
		'Model around real reads, writes, joins, ordering, and rollback constraints.',
		'Prefer explicit migration sequencing over one-step risky changes.',
	],
	'testing-playbook': [
		'Protect observable behavior before implementation details.',
		'Choose cases that catch likely regressions with deterministic setup.',
		'Use the project runner and fixture style before introducing new test structure.',
	],
};

const VERIFICATION_BIASES: Record<SkillFastArchetypeId, string[]> = {
	'design-rulebook': [
		'Verify responsive fit, focus behavior, hover/active states, and text overflow.',
		'Check that visual hierarchy still works in dense and narrow layouts.',
		'Confirm motion and polish do not hide loading, disabled, or error states.',
	],
	'technical-guide': [
		'Verify success, failure, edge, and integration paths with local commands when possible.',
		'Check typed boundaries, lifecycle behavior, and dependency ownership.',
		'Confirm the changed surface is observable through tests, logs, or manual reproduction.',
	],
	'workflow-pipeline': [
		'Verify each checkpoint before moving to the next step.',
		'Check missing input, partial failure, and recovery behavior.',
		'Confirm the final output includes enough evidence to reproduce the path.',
	],
	'security-playbook': [
		'Verify authorization server-side and check sensitive data exposure paths.',
		'Check secret movement, logging, persistence, and client-visible state.',
		'Confirm any risk rating has a concrete path and remediation target.',
	],
	'best-practices': [
		'Verify the highest-impact claim against the artifact before listing lower-value notes.',
		'Check that suggested fixes respect project constraints and existing conventions.',
		'Confirm residual risks and missing tests are called out separately.',
	],
	'integration-guide': [
		'Verify request/response shape, credentials, retries, and provider failure modes.',
		'Check client/server boundaries and environment setup.',
		'Confirm provider data is validated before downstream use.',
	],
	'database-playbook': [
		'Verify migrations, constraints, indexes, query paths, and rollback limits.',
		'Check existing data compatibility before changing relationships or defaults.',
		'Confirm transaction and concurrency behavior for writes.',
	],
	'testing-playbook': [
		'Verify assertions describe user, API, permission, or failure behavior.',
		'Check isolation, setup, cleanup, and deterministic data.',
		'Confirm coverage protects the highest-risk regression path.',
	],
};

const OUTPUT_BIASES = [
	'Keep the final response concrete: changed files, commands, decisions, and caveats.',
	'Prefer short structured sections only when they make the result easier to act on.',
	'Return exact paths, commands, schemas, or checks when the task depends on them.',
	'Separate completed work from assumptions, blockers, and next steps.',
];

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function pick<T>(items: T[], seed: number): T {
	return items[seed % items.length];
}

function referenceContextText(context: SkillFastRenderContext): string {
	const sectionText = (context.referenceSections ?? [])
		.map(section => `${section.title}\n${section.body}`)
		.join('\n');
	return [context.referenceInstructions, sectionText].filter(Boolean).join('\n');
}

function extractScopeTerms(context: SkillFastRenderContext, template: SkillFastTemplate): string[] {
	const source = normalizeSkillFastIntent([
		context.name,
		context.userDescription,
		context.activationDescription,
		template.title,
		template.categoryId,
		...context.techs,
		referenceContextText(context),
	].join(' '));
	const signalTerms = extractSkillFastIntentSignals(source, template, context).terms;
	const tokens = source
		.toLowerCase()
		.replace(/[^a-z0-9+#.]+/g, ' ')
		.split(/\s+/)
		.map(token => token.trim())
		.filter(token => token.length > 2 && !STOP_WORDS.has(token));

	return Array.from(new Set([...signalTerms, ...tokens])).slice(0, 5);
}

function buildScopeAnchor(scopeTerms: string[], template: SkillFastTemplate, seed: number): string {
	const fallbackTerms = [template.title.toLowerCase(), template.categoryId, template.id];
	const terms = scopeTerms.length > 0 ? scopeTerms : fallbackTerms;
	const primary = terms[seed % terms.length];
	const secondary = terms[(seed >>> 5) % terms.length];

	if (primary === secondary) {
		return `Center decisions on ${primary}.`;
	}

	return `Connect ${primary} decisions to ${secondary} constraints.`;
}

function buildDesignRulebookProfile(
	template: SkillFastTemplate,
	context: SkillFastRenderContext,
	referenceLine: string,
): SkillFastUniqueProfile | undefined {
	const signals = extractSkillFastIntentSignals(context.userDescription, template, context);
	if (signals.visualIdentity.length === 0) {
		return undefined;
	}
	const hoverTransition = signals.colorRows.find(row => row[0] === 'hoverTransition')?.[1];
	const hasYellowAccent = signals.colorRows.some(row => row[0] === 'accentText');
	const hasBlueAccent = signals.colorRows.some(row => row[0] === 'primary' && row[1] === '#1D4ED8');
	const hasRedAccent = signals.colorRows.some(row => row[0] === 'primary' && row[1] === '#DC2626');
	const hasGraySecondary = signals.colorRows.some(row => row[0] === 'secondary');
	const hasStaticIntent = signals.visualIdentity.some(identity => identity.includes('static interaction'));
	const hasGlassmorphism = signals.materialRows.some(row => row[0].includes('Glassmorphism'));
	const hasLiquidGlass = signals.materialRows.some(row => row[0].includes('Liquid glass'));
	const colorPriority = hasYellowAccent
		? hasRedAccent
			? 'Red (#DC2626) anchors the surface while yellow (#FACC15) pulls attention only where hierarchy needs it.'
			: 'Yellow (#FACC15) creates hierarchy; use it to pull the eye, not decorate.'
		: hasBlueAccent
			? 'Blue (#1D4ED8) anchors CTAs, active states, and hover fill through #DBEAFE.'
			: hasRedAccent
				? 'Red (#DC2626) anchors primary emphasis; use stronger red only for selected or high-emphasis states.'
				: hasGraySecondary
					? 'Gray (#6B7280) supports muted labels, inactive states, and secondary surfaces.'
					: 'Use color as hierarchy and state, not decoration.';
	const motionPriority = hasStaticIntent && hoverTransition
		? `Do not add decorative animation; keep only ${hoverTransition} hover and focus feedback for affordance.`
		: hoverTransition
		? `Motion must match the declared pace: hover transitions use ${hoverTransition}, with no instant state changes.`
		: 'Motion must clarify state changes without hiding feedback.';
	const motionAnchor = hasStaticIntent && hoverTransition
		? `Motion rule: static composition first; hover feedback uses ${hoverTransition} without decorative animation.`
		: hoverTransition
		? `Motion rule: hover feedback uses ${hoverTransition} and never shifts layout.`
		: 'Motion rule: feedback stays subtle, purposeful, and reduced-motion aware.';
	const hierarchyAnchor = hasStaticIntent
		? 'Hierarchy rule: structure first, material second, static states last.'
		: 'Hierarchy rule: structure first, accent second, motion last.';

	const priorities = [
		signals.terms.includes('bento hierarchy')
			? 'Every visual decision serves the bento grid structure first.'
			: 'Choose one clear visual structure before styling details.',
		colorPriority,
		motionPriority,
		hasGlassmorphism
			? 'Glassmorphism panels need a dark surface, translucent fill, visible border, and readable foreground contrast.'
			: '',
		hasLiquidGlass
			? 'Liquid glass belongs on interactive accents, especially buttons, with blur, translucent fill, and soft borders.'
			: '',
		referenceLine,
	].filter(Boolean);

	return {
		sectionTitle: ARCHETYPE_SECTION_TITLES['design-rulebook'],
		summary: [
			`Anchor the interface in ${signals.visualIdentity.slice(0, 3).join(', ')}.`,
			hasStaticIntent
				? 'Treat layout, color, material, and static interaction states as one system instead of separate decoration passes.'
				: 'Treat layout, color, material, and motion as one system instead of separate decoration passes.',
		].join(' '),
		anchors: [
			`Primary visual identity: ${signals.visualIdentity.slice(0, 3).join(', ')}.`,
			hierarchyAnchor,
			motionAnchor,
		],
		priorities,
		avoidances: [
			'generic AI aesthetics',
			'decorative color without hierarchy',
			hasStaticIntent ? 'decorative animation when the scope asks for none' : '',
			'instant hover transitions',
			hasStaticIntent ? 'state feedback that obscures status' : 'motion that obscures status',
		].filter(Boolean),
	};
}

export function buildSkillFastUniqueProfile(
	template: SkillFastTemplate,
	context: SkillFastRenderContext,
	archetype: SkillFastArchetypeId,
): SkillFastUniqueProfile {
	const referenceText = referenceContextText(context);
	const seed = hashString([
		context.name,
		context.userDescription,
		template.categoryId,
		template.id,
		context.techs.join(','),
		referenceText.slice(0, 400),
	].join('|'));
	const lens = pick(LENS_OPTIONS[archetype], seed);
	const scopeTerms = extractScopeTerms(context, template);
	const scopeLine = scopeTerms.length > 0
		? `Tune decisions around these scope signals: ${scopeTerms.join(', ')}.`
		: 'Tune decisions around the concrete files, user goal, and project evidence discovered during the task.';
	const referenceLine = referenceText.trim()
		? 'Use downloaded skill references only after adapting their pattern to this exact scope.'
		: 'Rely on local project evidence and this skill scope when no external reference is available.';
	const designProfile = archetype === 'design-rulebook'
		? buildDesignRulebookProfile(template, context, referenceLine)
		: undefined;
	if (designProfile) {
		return designProfile;
	}

	const anchors = [
		buildScopeAnchor(scopeTerms, template, seed),
		`Decision bias: ${pick(DECISION_BIASES[archetype], seed >>> 3)}`,
		`Verification bias: ${pick(VERIFICATION_BIASES[archetype], seed >>> 7)}`,
		`Output bias: ${pick(OUTPUT_BIASES, seed >>> 11)}`,
	];

	return {
		sectionTitle: ARCHETYPE_SECTION_TITLES[archetype],
		summary: `${lens.summary} ${scopeLine}`,
		anchors,
		priorities: [...lens.priorities, referenceLine],
		avoidances: lens.avoidances,
	};
}
