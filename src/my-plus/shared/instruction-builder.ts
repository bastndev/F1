/**
 * Single source of truth for the text F1 injects into a CLI session.
 *
 * Two consumers, one builder so they can never drift:
 *   - `sync-instructions.ts` writes `buildManagedBlock()` into AGENTS.md.
 *   - `SmartService.composePrompt()` types `buildPrimingPrompt()` into the CLI.
 *
 * Pure data — imports only constants (`memory-paths`, `smart-paths`); no `vscode`,
 * no `fs`, no DOM. Safe to import from either side.
 */

import { BLOCK_END, BLOCK_START, MEMORY_DIR, MEMORY_MAP_FILE, RULES_FILE } from '../my-memory/core/memory-paths';
import { SMART_READY_MESSAGE } from '../my-smart/core/smart-paths';

const RULES_REF = `./${MEMORY_DIR}/${RULES_FILE}`;
const MAP_REF = `./${MEMORY_DIR}/${MEMORY_MAP_FILE}`;

/** The managed block written at the top of AGENTS.md (between the F1 markers). */
export const buildManagedBlock = (): string => {
	return [
		BLOCK_START,
		'## Project context (F1 Smart + Skills)',
		'',
		'Before scanning files, read these first — they define how to work here and save tokens:',
		`- \`${RULES_REF}\` — working rules: how to behave in this project.`,
		`- \`${MAP_REF}\` — a prebuilt structural map of the project.`,
		BLOCK_END
	].join('\n');
};

/** The single-line priming prompt the host types into the CLI on a Smart launch. */
export const buildPrimingPrompt = (options: { graphReportRef?: string }): string => {
	const parts = [
		`Before we start, read \`${RULES_REF}\` for how I want you to work in this project, and follow those rules from now on.`,
		options.graphReportRef
			? `Also read \`${options.graphReportRef}\` — a compact code-graph of this project — so you grasp the structure without scanning every file.`
			: 'Take a quick look at the project structure so you understand it.',
		`Keep this first reply short, then end it with exactly: ${SMART_READY_MESSAGE}`
	];
	return parts.join(' ');
};
