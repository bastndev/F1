import type { SkillFastArchetypeId, SkillFastRenderContext, SkillFastTemplate } from './types';
import { buildSkillFastUniqueProfile } from './uniqueness';
import { getSkillFastVisualBlocks } from './visual-block-presets';
import { renderSkillFastVisualBlocks } from './visual-blocks';

const TEMPLATE_ARCHETYPES: Record<string, SkillFastArchetypeId> = {
	'web:web-design': 'design-rulebook',
	'web:web-styles': 'design-rulebook',
	'web:react-ui': 'technical-guide',
	'web:landing-ui': 'design-rulebook',
	'web:accessibility-ui': 'best-practices',
	'web:api-client-ui': 'integration-guide',
	'mobile:mobile-ui': 'design-rulebook',
	'mobile:mobile-animation': 'design-rulebook',
	'mobile:react-native-ui': 'technical-guide',
	'mobile:flutter-ui': 'technical-guide',
	'mobile:lynxjs-ui': 'technical-guide',
	'mobile:mobile-forms': 'technical-guide',
	'backend:api-design': 'technical-guide',
	'backend:auth-backend': 'security-playbook',
	'backend:database-backend': 'database-playbook',
	'backend:node-backend': 'technical-guide',
	'backend:validation-backend': 'technical-guide',
	'backend:observability-backend': 'best-practices',
	'ui-ux:design-system': 'design-rulebook',
	'ui-ux:visual-polish': 'design-rulebook',
	'ui-ux:accessibility-review': 'best-practices',
	'ui-ux:layout-system': 'design-rulebook',
	'ui-ux:motion-design': 'design-rulebook',
	'ui-ux:figma-handoff': 'integration-guide',
	'ai:rag-workflow': 'workflow-pipeline',
	'ai:agent-workflow': 'workflow-pipeline',
	'ai:openai-integration': 'integration-guide',
	'ai:prompt-engineering': 'best-practices',
	'ai:vector-search': 'technical-guide',
	'ai:ai-evals': 'testing-playbook',
	'testing:e2e-testing': 'testing-playbook',
	'testing:unit-testing': 'testing-playbook',
	'testing:component-testing': 'testing-playbook',
	'testing:api-testing': 'testing-playbook',
	'testing:accessibility-testing': 'testing-playbook',
	'testing:visual-regression': 'testing-playbook',
	'security:auth-security': 'security-playbook',
	'security:oauth-security': 'security-playbook',
	'security:secrets-security': 'security-playbook',
	'security:owasp-review': 'security-playbook',
	'security:api-security': 'security-playbook',
	'security:encryption-security': 'security-playbook',
	'database:database-schema': 'database-playbook',
	'database:prisma-database': 'database-playbook',
	'database:supabase-database': 'database-playbook',
	'database:postgres-database': 'database-playbook',
	'database:mongodb-database': 'database-playbook',
	'database:database-migrations': 'database-playbook',
};

interface ArchetypeProfile {
	whenToUse: string[];
	whenNotToUse: string[];
	quickReference: string[];
	gotchas: string[];
}

const ARCHETYPE_PROFILES: Record<SkillFastArchetypeId, ArchetypeProfile> = {
	'design-rulebook': {
		whenToUse: [
			'The task asks to create, review, refactor, or polish a visible interface.',
			'The output depends on layout, hierarchy, spacing, typography, color, motion, or interaction details.',
			'The user wants a result that feels intentionally designed rather than merely functional.',
		],
		whenNotToUse: [
			'The request is purely backend, data modeling, infrastructure, or CLI behavior.',
			'The user only needs a bug explanation with no UI or product-surface impact.',
		],
		quickReference: [
			'Purpose before visuals.',
			'Hierarchy before decoration.',
			'Stable layout before animation.',
			'Accessible interaction before polish.',
		],
		gotchas: [
			'Do not reuse generic AI-looking layouts when the product context suggests a clearer direction.',
			'Do not add visual effects that make the interface harder to scan or operate.',
			'Do not ignore narrow viewport, focus, and disabled states.',
		],
	},
	'technical-guide': {
		whenToUse: [
			'The task requires implementation, refactor, debugging, or review of a technical subsystem.',
			'The user needs concrete code-oriented guidance tied to existing files and project conventions.',
			'The work has contracts, state, runtime behavior, or framework-specific constraints.',
		],
		whenNotToUse: [
			'The task is only visual direction with no technical implementation constraints.',
			'The user needs high-level product brainstorming rather than project-specific execution.',
		],
		quickReference: [
			'Read local patterns first.',
			'Identify contracts and boundaries.',
			'Cover failure paths.',
			'Return commands or files when relevant.',
		],
		gotchas: [
			'Do not invent a framework or library when the repo already has a pattern.',
			'Do not hide assumptions about runtime, data shape, auth, or platform support.',
			'Do not skip edge states just because the happy path is simple.',
		],
	},
	'workflow-pipeline': {
		whenToUse: [
			'The task is a multi-step process with inputs, transformations, tools, and validation.',
			'The user needs a repeatable workflow rather than a one-off answer.',
			'The work benefits from checkpoints, fallback behavior, and clear stop conditions.',
		],
		whenNotToUse: [
			'The task is a single isolated code edit with no pipeline or external dependency.',
			'The user needs a static reference guide rather than an executable workflow.',
		],
		quickReference: [
			'Define inputs.',
			'Choose tools.',
			'Validate each step.',
			'Stop on unsafe or missing external state.',
		],
		gotchas: [
			'Do not continue a workflow when a required credential, file, or approval is missing.',
			'Do not let retries or loops run without a bounded exit condition.',
			'Do not treat generated intermediate output as correct without verification.',
		],
	},
	'security-playbook': {
		whenToUse: [
			'The task touches authentication, authorization, secrets, sensitive data, cryptography, or API exposure.',
			'The user asks for a security review, hardening pass, or implementation of protected flows.',
			'The work can create data exposure, privilege escalation, or trust-boundary mistakes.',
		],
		whenNotToUse: [
			'The task is purely visual and has no security-sensitive behavior.',
			'The user needs general education rather than project-specific risk analysis.',
		],
		quickReference: [
			'Trust boundaries first.',
			'Server-side checks always matter.',
			'Secrets never leak.',
			'Find exploitable paths, not theoretical noise.',
		],
		gotchas: [
			'Do not rely on frontend checks for authorization.',
			'Do not log tokens, secrets, personal data, or sensitive payloads.',
			'Do not add convenience paths that bypass existing security controls.',
		],
	},
	'best-practices': {
		whenToUse: [
			'The task asks for a review, optimization, standards alignment, or best-practice implementation.',
			'The output should prioritize issues by impact rather than list every possible concern.',
			'The repo already has code that can be measured against rules or heuristics.',
		],
		whenNotToUse: [
			'The user needs creative ideation with no concrete code or artifact to evaluate.',
			'The task has no local evidence and would become generic advice.',
		],
		quickReference: [
			'Prioritize impact.',
			'Use evidence.',
			'Make fixes concrete.',
			'Keep low-risk suggestions separate.',
		],
		gotchas: [
			'Do not bury critical findings under style preferences.',
			'Do not recommend changes that conflict with explicit project constraints.',
			'Do not claim a best practice applies without checking local context.',
		],
	},
	'integration-guide': {
		whenToUse: [
			'The task connects the project to an API, SDK, external service, design source, or client/server boundary.',
			'The implementation depends on credentials, schemas, webhooks, request/response handling, or generated assets.',
			'The user needs setup flow plus ongoing usage rules.',
		],
		whenNotToUse: [
			'The task is fully internal and has no external contract.',
			'The integration details are unavailable and cannot be inferred safely.',
		],
		quickReference: [
			'Map the boundary.',
			'Validate credentials and schemas.',
			'Handle failure responses.',
			'Document setup and runtime assumptions.',
		],
		gotchas: [
			'Do not expose server-only secrets to client code.',
			'Do not assume third-party responses are stable unless they are typed or validated.',
			'Do not skip rate limits, retries, or webhook verification when relevant.',
		],
	},
	'database-playbook': {
		whenToUse: [
			'The task changes schema, migrations, queries, indexes, data access, or persistence behavior.',
			'The user needs data integrity, performance, or rollout guidance.',
			'The work can affect existing production data or compatibility across app versions.',
		],
		whenNotToUse: [
			'The task only displays already-shaped data in UI with no persistence changes.',
			'The user needs a general explanation of database concepts without project context.',
		],
		quickReference: [
			'Model access patterns.',
			'Protect existing data.',
			'Plan migrations.',
			'Validate rollback risk.',
		],
		gotchas: [
			'Do not change schema without considering existing rows and deploy order.',
			'Do not add indexes without matching real filters, joins, ordering, or uniqueness needs.',
			'Do not use raw queries casually when project helpers or ORM patterns exist.',
		],
	},
	'testing-playbook': {
		whenToUse: [
			'The task asks to create, improve, debug, or review test coverage.',
			'The behavior has important user, API, permission, failure, or regression paths.',
			'The repo has an existing runner, fixtures, or testing style to preserve.',
		],
		whenNotToUse: [
			'The user needs a manual-only exploratory review with no testable behavior.',
			'The target behavior is undefined or not observable yet.',
		],
		quickReference: [
			'Test behavior, not internals.',
			'Use stable fixtures.',
			'Cover failure states.',
			'Keep runs deterministic.',
		],
		gotchas: [
			'Do not make assertions depend on timing, random data, or unrelated implementation details.',
			'Do not ignore setup and cleanup; test isolation matters.',
			'Do not add brittle selectors when accessible labels or stable test helpers exist.',
		],
	},
};

const VARIANT_PROFILE_OVERRIDES: Partial<Record<string, Partial<ArchetypeProfile>>> = {
	'web:web-design': {
		quickReference: [
			'Define the interface job.',
			'Pick a specific visual direction.',
			'Check responsive constraints.',
			'Polish interaction states.',
		],
		gotchas: [
			'Do not default to bland SaaS cards unless the product context calls for that density.',
			'Do not make text or controls fight for space on narrow viewports.',
		],
	},
	'backend:api-design': {
		quickReference: [
			'Resource and caller.',
			'Request and response contract.',
			'Validation and auth.',
			'Errors and side effects.',
		],
		gotchas: [
			'Do not add routes without explicit failure behavior.',
			'Do not trust request bodies before parsing and validation.',
		],
	},
	'backend:auth-backend': {
		whenToUse: [
			'The task changes login, sessions, roles, protected routes, account linking, or auth middleware.',
			'The user mentions OAuth, permissions, tokens, cookies, sessions, or admin-only behavior.',
		],
		gotchas: [
			'Do not confuse authentication with authorization.',
			'Do not store or expose tokens in client-visible state unless the existing architecture explicitly allows it.',
		],
	},
	'ai:rag-workflow': {
		quickReference: [
			'Corpus.',
			'Chunking.',
			'Embedding.',
			'Retrieval.',
			'Answer grounding.',
			'Evaluation.',
		],
		gotchas: [
			'Do not treat vector similarity as proof of correctness.',
			'Do not omit source traceability when the answer depends on documents.',
		],
	},
	'database:prisma-database': {
		quickReference: [
			'Read schema.prisma.',
			'Plan migration.',
			'Update Prisma Client usage.',
			'Check relation and query impact.',
		],
		gotchas: [
			'Do not confuse Prisma model names with underlying table names.',
			'Do not change relations without checking generated client usage.',
		],
	},
	'mobile:lynxjs-ui': {
		quickReference: [
			'Component structure.',
			'Runtime constraints.',
			'Touch layout.',
			'Platform behavior.',
		],
		gotchas: [
			'Do not assume browser-only APIs are available.',
			'Do not import React Native or web-only patterns unless the project already supports them.',
		],
	},
};

function orderedList(items: string[]): string {
	return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function bulletList(items: string[]): string {
	return items.map(item => `- ${item}`).join('\n');
}

function normalizeComparableItem(item: string): string {
	return item
		.toLowerCase()
		.replace(/^external\s+[\w-]+\s+signal:\s*/i, '')
		.replace(/[`*_~]/g, '')
		.replace(/[^a-z0-9+#.]+/g, ' ')
		.trim();
}

function uniqueItems(items: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];

	for (const item of items.map(value => value.trim()).filter(Boolean)) {
		const key = normalizeComparableItem(item);
		if (!key || seen.has(key)) {
			continue;
		}

		seen.add(key);
		unique.push(item);
	}

	return unique;
}

function compactDescription(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function mergeProfile(base: ArchetypeProfile, override?: Partial<ArchetypeProfile>): ArchetypeProfile {
	return {
		whenToUse: override?.whenToUse ?? base.whenToUse,
		whenNotToUse: override?.whenNotToUse ?? base.whenNotToUse,
		quickReference: override?.quickReference ?? base.quickReference,
		gotchas: override?.gotchas ?? base.gotchas,
	};
}

function getTemplateProfile(template: SkillFastTemplate): ArchetypeProfile {
	const archetype = getSkillFastArchetypeId(template);
	const override = VARIANT_PROFILE_OVERRIDES[`${template.categoryId}:${template.id}`];
	return mergeProfile(ARCHETYPE_PROFILES[archetype], override);
}

function uniqueLensSection(template: SkillFastTemplate, context: SkillFastRenderContext): string[] {
	const archetype = getSkillFastArchetypeId(template);
	const profile = buildSkillFastUniqueProfile(template, context, archetype);

	return [
		`## ${profile.sectionTitle}`,
		'',
		profile.summary,
		'',
		'Focus anchors:',
		'',
		bulletList(profile.anchors),
		'',
		'Priority signals:',
		'',
		bulletList(profile.priorities),
		'',
		'Avoid:',
		'',
		bulletList(profile.avoidances),
	];
}

function section(title: string, body: string): string[] {
	if (!body.trim()) {
		return [];
	}

	if (!title.trim()) {
		return ['', body];
	}

	return [title, '', body];
}

function optionalUserScope(context: SkillFastRenderContext): string {
	const description = compactDescription(context.userDescription);
	if (!description) {
		return '';
	}

	return `User-provided scope: ${description}`;
}

function bodyPurpose(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const userScope = optionalUserScope(context);
	if (!userScope) {
		return template.overview;
	}

	return `${template.overview} ${userScope}`;
}

function bodyScopeLine(template: SkillFastTemplate): string {
	return `Use this skill for ${template.title.toLowerCase()} tasks that match the user-provided scope and project evidence.`;
}

function referenceTargets(template: SkillFastTemplate): string {
	if (template.referenceHints.length === 0) {
		return 'Use relevant project files, tests, commands, and documentation discovered during the task.';
	}

	return [
		'Inspect these references when they exist in the project:',
		'',
		bulletList(template.referenceHints.map(hint => `\`${hint}\``)),
	].join('\n');
}

function referenceLines(context: SkillFastRenderContext, patterns: RegExp[], limit = 3): string[] {
	const sections = context.referenceSections ?? [];
	const matches = sections.filter(section => patterns.some(pattern => pattern.test(section.title)));

	return uniqueItems(
		matches.flatMap(section => section.body.split('\n')),
	).slice(0, limit);
}

function adaptedBullets(context: SkillFastRenderContext, patterns: RegExp[], prefix: string, limit = 3): string[] {
	return referenceLines(context, patterns, limit).map(line => `${prefix}: ${line}`);
}

function mergedBullets(base: string[], additions: string[]): string {
	return bulletList(uniqueItems([...base, ...additions]));
}

function visualReferenceBlock(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	return renderSkillFastVisualBlocks(getSkillFastVisualBlocks(template, context), 2);
}

function outputBlock(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const gotchaAdditions = adaptedBullets(context, [/\bgotchas?\b/i, /\bmistakes?\b/i, /\bpitfalls?\b/i, /\bsecurity\b/i], 'External signal to adapt', 2);
	return [
		'## Output Format',
		'',
		template.output,
		'',
		'Include the concrete outcome, key files or commands, and caveats that affect correctness.',
		'',
		'## Example',
		'',
		`Input: ${template.exampleInput}`,
		`Output: ${template.exampleOutput}`,
		'',
		'## Common Mistakes',
		'',
		mergedBullets(getTemplateProfile(template).gotchas, gotchaAdditions),
		'',
		'## Reference Targets',
		'',
		referenceTargets(template),
	].join('\n');
}

function renderDesignRulebook(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i, /\brules?\b/i], 'External reference signal', 2);
	return [
		'## Purpose',
		'',
		bodyPurpose(template, context),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Design Direction',
		'',
		bulletList([
			'Define the user goal, surface density, visual tone, and interaction priority before changing UI.',
			'Make one clear design decision that gives the result a memorable point of view.',
			'Keep the design compatible with the existing product language unless the user asks for a new direction.',
		]),
		'',
		'## Execution Rules',
		'',
		orderedList(template.instructions),
		'',
		'## Quality Gates',
		'',
		bulletList([
			'No generic visual filler.',
			'No unreadable text, unstable spacing, or overlapping controls.',
			'Keyboard, focus, hover, loading, and narrow viewport states stay coherent.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderTechnicalGuide(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const workflowAdditions = adaptedBullets(context, [/\bworkflow\b/i, /\binstructions?\b/i, /\bhow\s+it\s+works\b/i], 'External workflow signal', 2);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i, /\brules?\b/i], 'External reference signal', 2);
	return [
		'## Scope',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Implementation Workflow',
		'',
		orderedList(uniqueItems([...template.instructions, ...workflowAdditions])),
		'',
		'## Technical Checks',
		'',
		bulletList([
			'Preserve existing architecture and naming patterns.',
			'Cover success, failure, loading, validation, and edge cases relevant to the change.',
			'Prefer typed contracts and explicit boundaries over implicit assumptions.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderWorkflowPipeline(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const workflowAdditions = adaptedBullets(context, [/\bworkflow\b/i, /\binstructions?\b/i, /\bhow\s+it\s+works\b/i], 'External workflow signal', 3);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i, /\brules?\b/i], 'External reference signal', 2);
	return [
		'## Workflow Goal',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Pipeline',
		'',
		orderedList(uniqueItems([...template.instructions, ...workflowAdditions])),
		'',
		'## Decision Points',
		'',
		bulletList([
			'Identify inputs, outputs, tools, and stop conditions before executing the workflow.',
			'Validate intermediate results before moving to the next step.',
			'Escalate or ask for missing external state when the workflow cannot proceed safely.',
		]),
		'',
		'## Failure Handling',
		'',
		bulletList([
			'Handle missing context explicitly.',
			'Keep retries bounded and observable.',
			'Return partial findings with clear caveats when complete execution is not possible.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderSecurityPlaybook(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const workflowAdditions = adaptedBullets(context, [/\bworkflow\b/i, /\bsecurity\b/i, /\brules?\b/i], 'External review signal', 3);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i, /\bsecurity\b/i], 'External reference signal', 2);
	return [
		'## Security Scope',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Review Workflow',
		'',
		orderedList(uniqueItems([...template.instructions, ...workflowAdditions])),
		'',
		'## Risk Rules',
		'',
		bulletList([
			'Prioritize exploitable risk over theoretical concerns.',
			'Never weaken auth, validation, secret handling, or auditability for convenience.',
			'Call out residual risk and verification steps when a fix cannot be proven locally.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderBestPractices(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const ruleAdditions = adaptedBullets(context, [/\brules?\b/i, /\bquick\s+reference\b/i, /\binstructions?\b/i], 'External priority signal', 3);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i], 'External reference signal', 2);
	return [
		'## Applicability',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Priority Rules',
		'',
		orderedList(uniqueItems([...template.instructions, ...ruleAdditions])),
		'',
		'## Quick Checks',
		'',
		bulletList([
			'Start with the highest-impact issue that affects correctness, usability, security, or performance.',
			'Prefer concrete findings and code references over broad advice.',
			'Keep recommendations actionable and scoped to the actual task.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderIntegrationGuide(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const setupAdditions = adaptedBullets(context, [/\bsetup\b/i, /\bworkflow\b/i, /\binstructions?\b/i], 'External setup signal', 3);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i], 'External reference signal', 2);
	return [
		'## Integration Scope',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Setup And Flow',
		'',
		orderedList(uniqueItems([...template.instructions, ...setupAdditions])),
		'',
		'## Boundary Checks',
		'',
		bulletList([
			'Identify external APIs, credentials, schemas, rate limits, and environment requirements.',
			'Keep client/server boundaries explicit.',
			'Document fallback behavior for missing credentials, unavailable services, and malformed responses.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderDatabasePlaybook(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const modelingAdditions = adaptedBullets(context, [/\bworkflow\b/i, /\bdatabase\b/i, /\brules?\b/i], 'External data signal', 3);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i], 'External reference signal', 2);
	return [
		'## Data Scope',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Modeling Workflow',
		'',
		orderedList(uniqueItems([...template.instructions, ...modelingAdditions])),
		'',
		'## Integrity And Migration Rules',
		'',
		bulletList([
			'Protect existing data and document migration/backfill needs.',
			'Use constraints, indexes, transactions, and validation where they materially improve correctness.',
			'Call out rollout and rollback risks for schema or data changes.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

function renderTestingPlaybook(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const profile = getTemplateProfile(template);
	const whenToUseAdditions = adaptedBullets(context, [/\bwhen\s+to\s+use\b/i], 'External use signal', 2);
	const whenNotToUseAdditions = adaptedBullets(context, [/\bwhen\s+not\s+to\s+use\b/i], 'External avoid signal', 2);
	const testAdditions = adaptedBullets(context, [/\bworkflow\b/i, /\btest\b/i, /\brules?\b/i], 'External test signal', 3);
	const quickReferenceAdditions = adaptedBullets(context, [/\bquick\s+reference\b/i], 'External reference signal', 2);
	return [
		'## Test Scope',
		'',
		template.overview,
		'',
		bodyScopeLine(template),
		...section('', optionalUserScope(context)),
		'',
		...uniqueLensSection(template, context),
		'',
		'## When To Use',
		'',
		mergedBullets(profile.whenToUse, whenToUseAdditions),
		'',
		'## When Not To Use',
		'',
		mergedBullets(profile.whenNotToUse, whenNotToUseAdditions),
		'',
		'## Test Workflow',
		'',
		orderedList(uniqueItems([...template.instructions, ...testAdditions])),
		'',
		'## Coverage Rules',
		'',
		bulletList([
			'Cover the behavior users or callers rely on, not private implementation details.',
			'Include important failure, edge, loading, and permission states.',
			'Keep tests deterministic and aligned with the existing runner and fixture style.',
		]),
		...section('', visualReferenceBlock(template, context)),
		'',
		'## Quick Reference',
		'',
		mergedBullets(profile.quickReference, quickReferenceAdditions),
		'',
		outputBlock(template, context),
	].join('\n');
}

export function getSkillFastArchetypeId(template: SkillFastTemplate): SkillFastArchetypeId {
	return TEMPLATE_ARCHETYPES[`${template.categoryId}:${template.id}`] ?? 'technical-guide';
}

export function renderSkillFastTemplateBody(template: SkillFastTemplate, context: SkillFastRenderContext): string {
	const archetype = getSkillFastArchetypeId(template);

	switch (archetype) {
		case 'design-rulebook':
			return renderDesignRulebook(template, context);
		case 'workflow-pipeline':
			return renderWorkflowPipeline(template, context);
		case 'security-playbook':
			return renderSecurityPlaybook(template, context);
		case 'best-practices':
			return renderBestPractices(template, context);
		case 'integration-guide':
			return renderIntegrationGuide(template, context);
		case 'database-playbook':
			return renderDatabasePlaybook(template, context);
		case 'testing-playbook':
			return renderTestingPlaybook(template, context);
		case 'technical-guide':
		default:
			return renderTechnicalGuide(template, context);
	}
}
