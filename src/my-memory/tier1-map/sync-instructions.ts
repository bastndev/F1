/**
 * Writes the idempotent managed block into a CLI's instructions file
 * (CLAUDE.md / AGENTS.md / .github/copilot-instructions.md) pointing it at
 * `.f1/project-map.md`. This is the mechanism that makes a CLI load project
 * context on its own — the engine of the whole feature.
 *
 * Idempotent and non-destructive: replaces the block if present, appends
 * otherwise, and never touches the user's own content.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	BLOCK_END,
	BLOCK_START,
	MEMORY_DIR,
	MEMORY_MAP_FILE,
	allInstructionFiles,
	instructionFileForSlug
} from '../core/memory-paths';

const buildBlock = (): string => {
	return [
		BLOCK_START,
		'## Project context (F1 My Memory)',
		'',
		`This project ships a prebuilt context map at \`./${MEMORY_DIR}/${MEMORY_MAP_FILE}\`.`,
		'Read it first to understand the structure before scanning files — it saves tokens.',
		BLOCK_END
	].join('\n');
};

/** Insert/replace the managed block in one instruction file (best-effort). */
const syncOne = (root: string, relFile: string): boolean => {
	try {
		const filePath = path.join(root, relFile);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });

		const block = buildBlock();
		let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

		const start = content.indexOf(BLOCK_START);
		const end = content.indexOf(BLOCK_END);
		if (start !== -1 && end !== -1) {
			content = content.slice(0, start) + block + content.slice(end + BLOCK_END.length);
		} else {
			content = content.trim().length ? `${content.trimEnd()}\n\n${block}\n` : `${block}\n`;
		}

		fs.writeFileSync(filePath, content, 'utf8');
		return true;
	} catch (error) {
		console.error(`[my-memory] sync ${relFile} failed:`, error);
		return false;
	}
};

/** Sync just the instruction file for one CLI slug (used on launch). */
export const syncInstructionFileForSlug = (root: string, slug: string | undefined): string[] => {
	const relFile = instructionFileForSlug(slug);
	return syncOne(root, relFile) ? [relFile] : [];
};

/** Sync every known CLI's instruction file at once (used on rebuild). */
export const syncAllInstructionFiles = (root: string): string[] => {
	const updated: string[] = [];
	for (const relFile of allInstructionFiles()) {
		if (syncOne(root, relFile)) {
			updated.push(relFile);
		}
	}
	return updated;
};
