/**
 * Typed contract for the My Skills webview's window-event bus — the
 * CustomEvents the bridge (view/index.ts) and the create-skill screens use to
 * talk to each other. One map from event name to payload, plus emit/on
 * helpers, replaces string literals and per-listener `as` casts. Runtime stays
 * plain window CustomEvents, so screens that still dispatch/listen by hand
 * interoperate unchanged; payloads relayed verbatim from host messages are
 * typed as the shape their consumers validate.
 */
import type { CreateSkillChatSubmitDetail, CreateSkillTarget } from '../screens/create-skill/ui/shared/types';

export type CreateInstructionRootFileName = 'AGENTS.md' | 'CLAUDE.md';
export type CreateRootFilesStatus = Record<string, boolean>;

export interface CreateSkillEventMap {
	// ── Create flow ────────────────────────────────────────────────
	'createSkill.chat.create': { name: string; query: string; target: CreateSkillTarget; template: string };
	'createSkill.chat.submit': CreateSkillChatSubmitDetail;
	'createSkill.chat.typing': { query: string };
	'createSkill.flow.complete': undefined;
	'createSkillResult': { success: boolean; message?: string };

	// ── Name modal ─────────────────────────────────────────────────
	'createSkill.namePrompt.open': { target?: CreateSkillTarget; template?: string; initialValue?: string };
	'createSkill.namePrompt.cancel': undefined;
	'createSkill.skillName.confirm': { name?: string; target?: string; template?: string };

	// ── Category picker ────────────────────────────────────────────
	'createSkill.category.reset': undefined;
	'createSkill.category.mainSelected': { categoryId?: string; categoryLabel?: string };
	'createSkill.category.selected': { categoryId?: string; subcategoryId?: string };

	// ── Search mode ────────────────────────────────────────────────
	'createSkill.search.typing': { query: string };
	'createSkill.search.request': { query: string; requestId: number; limit?: number };
	'createSkill.search.prefetch': undefined;
	/** Host search payload relayed verbatim; the search screen owns its shape. */
	'createSkill.search.update': Record<string, unknown>;
	'createSkill.search.state': { hasCompletedSearch?: boolean };

	// ── DESIGN.md flow ─────────────────────────────────────────────
	'createSkill.design.open': { overwrite?: boolean } | undefined;
	'createSkill.design.back': undefined;
	'createSkill.design.reset': undefined;
	'createSkill.design.edit': undefined;
	'createSkill.design.create': {
		selection: {
			colorId?: string;
			typographyId?: string;
			styleId?: string;
			skipColor?: boolean;
			skipTypography?: boolean;
			skipStyle?: boolean;
		};
		overwrite?: boolean;
	};
	/** Host design payload relayed verbatim; the design screen owns its shape. */
	'createSkill.design.status': Record<string, unknown>;

	// ── Root instruction files ─────────────────────────────────────
	'createSkill.rootFiles.request': undefined;
	'createSkill.rootFiles.update': CreateRootFilesStatus;
	'createSkill.rootFile.create': { fileName: CreateInstructionRootFileName };
	'createSkill.rootFile.status': { fileName: CreateInstructionRootFileName; status: 'writing' | 'created' | 'error'; message?: string };

	// ── Install / local sync ───────────────────────────────────────
	'createSkill.install.request': { id: string };
	'createSkill.folders.sync': { agents: string[]; claude: string[] };
}

export type CreateSkillEventName = keyof CreateSkillEventMap;

interface EmitOptions {
	cancelable?: boolean;
}

// Payload-less events may omit the detail argument; payload-carrying events
// must pass one, checked at the call site by this tuple shape.
type EmitArgs<K extends CreateSkillEventName> = undefined extends CreateSkillEventMap[K]
	? [detail?: CreateSkillEventMap[K], options?: EmitOptions]
	: [detail: CreateSkillEventMap[K], options?: EmitOptions];

/** Dispatch a bus event. Returns false when a cancelable event was preventDefault-ed. */
export function emitSkillsEvent<K extends CreateSkillEventName>(type: K, ...args: EmitArgs<K>): boolean {
	const [detail, options] = args;
	return window.dispatchEvent(new CustomEvent(type, { detail, cancelable: options?.cancelable === true }));
}

/**
 * Subscribe to a bus event with a typed detail. Events from unconverted
 * screens cross as plain CustomEvents, so listeners keep any field-level
 * runtime guards they had — the type states the contract, not a proof.
 */
export function onSkillsEvent<K extends CreateSkillEventName>(
	type: K,
	listener: (detail: CreateSkillEventMap[K], event: Event) => void,
): void {
	window.addEventListener(type, event => {
		const detail = event instanceof CustomEvent ? (event.detail as CreateSkillEventMap[K]) : (undefined as CreateSkillEventMap[K]);
		listener(detail, event);
	});
}
