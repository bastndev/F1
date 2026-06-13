import type { SkillFastRenderContext, SkillFastTemplate } from './types';
import { extractSkillFastIntentSignals } from './intent-signals';
import type { SkillFastVisualBlock } from './visual-blocks';

type SkillFastVisualBlockFactory = (template: SkillFastTemplate, context: SkillFastRenderContext) => SkillFastVisualBlock[];

function tableBlock(title: string, headers: string[], rows: string[][], intro?: string): SkillFastVisualBlock {
	return { kind: 'table', title, intro, headers, rows };
}

function matrixBlock(title: string, headers: string[], rows: string[][], intro?: string): SkillFastVisualBlock {
	return { kind: 'matrix', title, intro, headers, rows };
}

function checklistBlock(title: string, items: string[], intro?: string): SkillFastVisualBlock {
	return { kind: 'checklist', title, intro, items };
}

function codeFenceBlock(title: string, language: string, lines: string[], intro?: string): SkillFastVisualBlock {
	return { kind: 'codeFence', title, intro, language, lines };
}

function fileTreeBlock(title: string, lines: string[], intro?: string): SkillFastVisualBlock {
	return { kind: 'fileTree', title, intro, language: 'text', lines };
}

function designTokenBlocks(_template: SkillFastTemplate, context: SkillFastRenderContext): SkillFastVisualBlock[] {
	const signals = extractSkillFastIntentSignals(context.userDescription, _template, context);
	const dynamicBlocks: SkillFastVisualBlock[] = [];

	if (signals.colorRows.length > 0) {
		dynamicBlocks.push(tableBlock(
			'Visual Identity Tokens',
			['Token', 'Value', 'Use'],
			signals.colorRows,
			'Use these values as direction, then map them to the project token system instead of scattering raw values.',
		));
	}

	if (signals.motionRows.length > 0) {
		const motionBlock = matrixBlock(
			'Motion Timing Matrix',
			['Element', 'Timing', 'Rule'],
			signals.motionRows,
			'Motion should make state changes feel intentional without hiding feedback or blocking task completion.',
		);
		if (signals.materialRows.length === 0) {
			dynamicBlocks.push(motionBlock);
		}
	}

	if (signals.materialRows.length > 0) {
		dynamicBlocks.push(tableBlock(
			'Material Direction',
			['Pattern', 'Implementation Rule'],
			signals.materialRows,
		));
	}

	return [
		...dynamicBlocks,
		tableBlock(
			'Design Token Map',
			['Token', 'Use', 'Rule'],
			[
				['primary', 'Main action, selected state, key accent', 'Use sparingly and consistently.'],
				['surface', 'Page and component background', 'Keep contrast readable before adding polish.'],
				['surfaceMuted', 'Secondary panels and quiet containers', 'Use for grouping, not decoration.'],
				['text', 'Primary readable foreground', 'Never lower contrast for style alone.'],
				['border', 'Dividers, inputs, card edges', 'Keep thin and functional.'],
			],
		),
		matrixBlock(
			'Component State Matrix',
			['State', 'Visual Treatment', 'Check'],
			[
				['Default', 'Stable layout, clear label, expected affordance', 'No content shift.'],
				['Hover', 'Subtle contrast or elevation change', 'Do not hide controls on touch-only flows.'],
				['Focus', 'Visible focus ring or outline', 'Keyboard path remains obvious.'],
				['Disabled', 'Muted but readable', 'State cannot be confused with loading.'],
				['Error', 'Specific message near the control', 'Color is paired with text or icon.'],
			],
		),
	];
}

function backendApiBlocks(): SkillFastVisualBlock[] {
	return [
		fileTreeBlock(
			'File Structure',
			[
				'app/',
				'  api/',
				'    hello+api.ts          -> GET /api/hello',
				'    users+api.ts          -> /api/users',
				'    users/[id]+api.ts     -> /api/users/:id',
				'  services/',
				'    users.service.ts',
				'  schemas/',
				'    users.schema.ts',
			],
			'Use this as a shape reference when the project follows file-based API routes. Adapt names to the actual framework.',
		),
		matrixBlock(
			'Route Contract Matrix',
			['Piece', 'Question', 'Output'],
			[
				['Resource', 'What object or action does the route own?', 'Route name and service boundary.'],
				['Caller', 'Who can call it and from where?', 'Auth and rate-limit assumptions.'],
				['Request', 'What params, body, and headers are valid?', 'Schema plus invalid examples.'],
				['Response', 'What is returned on success?', 'Typed response shape.'],
				['Failure', 'How do validation, auth, not found, and server errors look?', 'Stable error format.'],
			],
		),
	];
}

function backendAuthBlocks(): SkillFastVisualBlock[] {
	return [
		tableBlock(
			'Auth Configuration Matrix',
			['Option', 'Notes'],
			[
				['appName', 'Optional display name.'],
				['baseURL', 'Only when the runtime does not already provide the canonical auth URL.'],
				['basePath', 'Default auth route prefix. Change only when routing requires it.'],
				['secret', 'Required through environment or secret manager, never client-visible state.'],
				['database', 'Required for persistent users, sessions, accounts, and verification data.'],
				['secondaryStorage', 'Redis or KV for sessions, rate limits, or temporary verification state.'],
				['emailAndPassword', 'Enable only when password flows and reset behavior are implemented.'],
				['socialProviders', 'Each provider needs client ID, client secret, callback URL, and scopes.'],
				['plugins', 'Add only after checking lifecycle, storage, and route impact.'],
				['trustedOrigins', 'CSRF and redirect whitelist. Keep explicit.'],
			],
		),
		matrixBlock(
			'Trust Boundary Map',
			['Boundary', 'Allowed', 'Never'],
			[
				['Client', 'Display auth state and submit credentials over HTTPS.', 'Store server secrets or bypass authorization.'],
				['Server route', 'Validate session, role, input, and redirect target.', 'Trust client-only checks.'],
				['Database', 'Persist users, sessions, accounts, and audit metadata.', 'Store plaintext secrets.'],
				['Provider', 'Exchange tokens through server-side callbacks.', 'Expose client secret to browser code.'],
			],
		),
	];
}

function databaseBlocks(): SkillFastVisualBlock[] {
	return [
		matrixBlock(
			'Schema Change Matrix',
			['Change', 'Check', 'Risk'],
			[
				['New column', 'Default, nullability, existing rows', 'Deploy can fail on old data.'],
				['Relation', 'Cardinality, cascade behavior, generated client usage', 'Orphaned or deleted records.'],
				['Index', 'Real filter, join, order, or uniqueness path', 'Write overhead with no read benefit.'],
				['Migration', 'Deploy order, backfill, rollback limit', 'Downtime or partial data movement.'],
				['Raw query', 'Parameter binding and permission boundary', 'Injection or bypassed helpers.'],
			],
		),
		codeFenceBlock(
			'Migration Skeleton',
			'sql',
			[
				'-- 1. Add nullable column or compatible table first.',
				'ALTER TABLE projects ADD COLUMN owner_id TEXT;',
				'',
				'-- 2. Backfill with a bounded, observable process.',
				'-- UPDATE projects SET owner_id = ... WHERE owner_id IS NULL;',
				'',
				'-- 3. Add constraints only after data is valid.',
				'-- ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL;',
			],
			'Use this skeleton as sequencing guidance. Replace SQL with the project migration tool when one exists.',
		),
	];
}

function testingBlocks(): SkillFastVisualBlock[] {
	return [
		matrixBlock(
			'Test Coverage Matrix',
			['Layer', 'Goal', 'Examples'],
			[
				['Unit', 'Validate isolated rules and data transforms.', 'Schema parsing, pure helpers, edge values.'],
				['Component', 'Validate rendered states and user interactions.', 'Loading, empty, error, disabled, focus.'],
				['API', 'Validate contracts and failure responses.', 'Auth failure, invalid body, not found, success.'],
				['E2E', 'Protect the user path across screens or services.', 'Create, edit, delete, permissions.'],
				['Regression', 'Freeze a previous bug path.', 'Minimal case that would fail before the fix.'],
			],
		),
		checklistBlock(
			'Quality Gate Checklist',
			[
				'The test proves behavior users or callers rely on.',
				'Setup and cleanup are deterministic.',
				'Selectors, fixtures, and commands match the existing project.',
				'Failure output explains what broke.',
				'The test avoids timing, random data, and private implementation details.',
			],
		),
	];
}

function mobileBlocks(): SkillFastVisualBlock[] {
	return [
		fileTreeBlock(
			'Mobile App Structure',
			[
				'src/',
				'  app/',
				'    app-shell.tsx',
				'    navigation.tsx',
				'  screens/',
				'    home-screen.tsx',
				'    settings-screen.tsx',
				'  components/',
				'    action-bar.tsx',
				'    touch-card.tsx',
				'  styles/',
				'    tokens.ts',
			],
			'Use this shape as a portable reference. Adapt it to Flutter, React Native, LynxJS, or the project runtime.',
		),
		matrixBlock(
			'Mobile Interaction Matrix',
			['Surface', 'Design Rule', 'Check'],
			[
				['Touch target', 'Keep primary controls easy to hit.', 'Minimum useful size and spacing.'],
				['Navigation', 'Make back, close, and primary actions predictable.', 'No hidden dead ends.'],
				['Keyboard', 'Inputs stay visible and recover after submit.', 'No covered fields.'],
				['Motion', 'Clarify transition direction.', 'Reduced-motion path exists.'],
				['Offline/error', 'Explain state and recovery action.', 'No silent failure.'],
			],
		),
	];
}

function aiBlocks(): SkillFastVisualBlock[] {
	return [
		matrixBlock(
			'AI Workflow Matrix',
			['Stage', 'Decision', 'Evidence'],
			[
				['Input', 'What context is trusted?', 'User prompt, files, docs, metadata.'],
				['Retrieval', 'What sources are allowed?', 'Indexed docs, local files, approved APIs.'],
				['Reasoning', 'What constraints guide the answer?', 'Schema, examples, policies, tests.'],
				['Output', 'What format is required?', 'Markdown, JSON, patch, report, command.'],
				['Evaluation', 'How is quality checked?', 'Tests, citations, assertions, examples.'],
			],
		),
		codeFenceBlock(
			'Structured Output Shape',
			'json',
			[
				'{',
				'  "result": "short outcome",',
				'  "evidence": ["source or file checked"],',
				'  "next_action": "concrete follow-up or null"',
				'}',
			],
		),
	];
}

function securityBlocks(): SkillFastVisualBlock[] {
	return [
		matrixBlock(
			'Security Review Matrix',
			['Area', 'Question', 'Failure Mode'],
			[
				['Authn', 'How is identity proven?', 'Spoofed or stale identity.'],
				['Authz', 'Who can perform this action?', 'Privilege escalation.'],
				['Secrets', 'Where do tokens and keys live?', 'Client exposure or logs.'],
				['Input', 'What is parsed and validated?', 'Injection or unsafe coercion.'],
				['Audit', 'Can risky actions be traced?', 'Uninvestigable incidents.'],
			],
		),
		checklistBlock(
			'Risk Triage Checklist',
			[
				'There is a concrete exploit path, not only a theoretical concern.',
				'Impact and likelihood are separated.',
				'Server-side enforcement is identified.',
				'Secrets and sensitive data paths are checked.',
				'Residual risk and verification steps are stated.',
			],
		),
	];
}

const VISUAL_BLOCKS_BY_TEMPLATE: Record<string, SkillFastVisualBlockFactory> = {
	'web:web-design': designTokenBlocks,
	'web:web-styles': designTokenBlocks,
	'web:landing-ui': designTokenBlocks,
	'web:accessibility-ui': designTokenBlocks,
	'mobile:mobile-ui': mobileBlocks,
	'mobile:mobile-animation': mobileBlocks,
	'mobile:flutter-ui': mobileBlocks,
	'mobile:lynxjs-ui': mobileBlocks,
	'mobile:mobile-forms': mobileBlocks,
	'backend:api-design': backendApiBlocks,
	'backend:auth-backend': backendAuthBlocks,
	'backend:database-backend': databaseBlocks,
	'ui-ux:design-system': designTokenBlocks,
	'ui-ux:visual-polish': designTokenBlocks,
	'ui-ux:layout-system': designTokenBlocks,
	'ui-ux:motion-design': designTokenBlocks,
	'ui-ux:figma-handoff': designTokenBlocks,
	'database:database-schema': databaseBlocks,
	'database:prisma-database': databaseBlocks,
	'database:supabase-database': databaseBlocks,
	'database:postgres-database': databaseBlocks,
	'database:mongodb-database': databaseBlocks,
	'database:database-migrations': databaseBlocks,
	'testing:e2e-testing': testingBlocks,
	'testing:unit-testing': testingBlocks,
	'testing:component-testing': testingBlocks,
	'testing:api-testing': testingBlocks,
	'testing:accessibility-testing': testingBlocks,
	'testing:visual-regression': testingBlocks,
	'security:auth-security': securityBlocks,
	'security:oauth-security': securityBlocks,
	'security:secrets-security': securityBlocks,
	'security:owasp-review': securityBlocks,
	'security:api-security': securityBlocks,
	'security:encryption-security': securityBlocks,
	'ai:rag-workflow': aiBlocks,
	'ai:agent-workflow': aiBlocks,
	'ai:openai-integration': aiBlocks,
	'ai:prompt-engineering': aiBlocks,
	'ai:vector-search': aiBlocks,
	'ai:ai-evals': testingBlocks,
};

function hasDynamicVisualBlock(block: SkillFastVisualBlock): boolean {
	return block.title === 'Visual Identity Tokens'
		|| block.title === 'Motion Timing Matrix'
		|| block.title === 'Material Direction';
}

const VISUAL_BLOCK_LIMIT_BY_TEMPLATE: Record<string, number> = {
	'web:web-design': 2,
	'web:web-styles': 1,
	'web:landing-ui': 1,
	'web:accessibility-ui': 1,
	'mobile:mobile-ui': 1,
	'mobile:mobile-animation': 1,
	'mobile:flutter-ui': 1,
	'mobile:lynxjs-ui': 1,
	'mobile:mobile-forms': 1,
	'backend:api-design': 2,
	'backend:auth-backend': 1,
	'backend:database-backend': 1,
	'ui-ux:design-system': 2,
	'ui-ux:visual-polish': 1,
	'ui-ux:layout-system': 1,
	'ui-ux:motion-design': 1,
	'ui-ux:figma-handoff': 1,
	'database:database-schema': 1,
	'database:prisma-database': 2,
	'database:supabase-database': 1,
	'database:postgres-database': 1,
	'database:mongodb-database': 1,
	'database:database-migrations': 2,
	'testing:e2e-testing': 1,
	'testing:unit-testing': 1,
	'testing:component-testing': 1,
	'testing:api-testing': 2,
	'testing:accessibility-testing': 1,
	'testing:visual-regression': 1,
	'security:auth-security': 1,
	'security:oauth-security': 1,
	'security:secrets-security': 1,
	'security:owasp-review': 2,
	'security:api-security': 1,
	'security:encryption-security': 1,
	'ai:rag-workflow': 2,
	'ai:agent-workflow': 1,
	'ai:openai-integration': 1,
	'ai:vector-search': 1,
	'ai:ai-evals': 1,
};

export function getSkillFastVisualBlockCandidates(
	template: SkillFastTemplate,
	context: SkillFastRenderContext,
): SkillFastVisualBlock[] {
	const templateKey = `${template.categoryId}:${template.id}`;
	const factory = VISUAL_BLOCKS_BY_TEMPLATE[templateKey];

	return factory ? factory(template, context) : [];
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function rotateBlocks(blocks: SkillFastVisualBlock[], seed: number): SkillFastVisualBlock[] {
	if (blocks.length <= 1) {
		return blocks;
	}

	const start = seed % blocks.length;
	return [...blocks.slice(start), ...blocks.slice(0, start)];
}

export function getSkillFastVisualBlocks(
	template: SkillFastTemplate,
	context: SkillFastRenderContext,
): SkillFastVisualBlock[] {
	const templateKey = `${template.categoryId}:${template.id}`;
	const maxBlocks = VISUAL_BLOCK_LIMIT_BY_TEMPLATE[templateKey] ?? 0;
	if (maxBlocks <= 0) {
		return [];
	}

	const candidates = getSkillFastVisualBlockCandidates(template, context);
	if (candidates.length === 0) {
		return [];
	}

	const seed = hashString([
		context.name,
		context.userDescription,
		template.categoryId,
		template.id,
		context.techs.join(','),
	].join('|'));
	const count = Math.min(candidates.length, maxBlocks, maxBlocks > 1 && seed % 2 === 0 ? 2 : 1);
	const dynamicBlocks = candidates.filter(hasDynamicVisualBlock);
	if (dynamicBlocks.length > 0) {
		const dynamicCount = Math.min(candidates.length, maxBlocks, Math.max(count, Math.min(dynamicBlocks.length, 2)));
		return [...dynamicBlocks, ...candidates.filter(block => !hasDynamicVisualBlock(block))].slice(0, dynamicCount);
	}

	return rotateBlocks(candidates, seed).slice(0, count);
}
