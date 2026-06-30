/**
 * Points each CLI at the shared `.f1/` context.
 *
 * AGENTS.md is the hub: every CLI reads it, so it carries the managed block
 * (between the F1-MEMORY markers) at the TOP of the file — the first thing a
 * CLI sees. CLAUDE.md is only a thin `@AGENTS.md` import, because Claude Code
 * keys off CLAUDE.md and won't read AGENTS.md on its own.
 *
 * Non-destructive by contract: we only ever own the marked block in AGENTS.md
 * and the `@AGENTS.md` line in CLAUDE.md. The user's own content (hand-written
 * rules, team conventions) is never moved or deleted — losing it would be fatal.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	BLOCK_END,
	BLOCK_START,
	CLAUDE_FILE,
	CLAUDE_IMPORT_LINE,
	CLAUDE_SLUG,
	HUB_FILE
} from '../core/memory-paths';
import { atomicWriteFile, backupPristineFile, writeFileIfChanged } from '../core/atomic-write';
import { buildManagedBlock } from '../../shared/instruction-builder';

/**
 * Return `content` with the managed block at the top: just under the first H1
 * heading if there is one, otherwise at the very start. Any existing block is
 * stripped from wherever it currently sits first, so the result is idempotent
 * and the block is always at the top. Only the marked region is ever changed.
 */
const upsertBlockAtTop = (content: string, block: string): string => {
	let body = content;
	const start = body.indexOf(BLOCK_START);
	const end = body.indexOf(BLOCK_END);
	if (start !== -1 && end !== -1 && end > start) {
		body = body.slice(0, start) + body.slice(end + BLOCK_END.length);
	}
	body = body.trim();

	if (!body) {
		return `${block}\n`;
	}

	const lines = body.split('\n');
	const h1Index = lines.findIndex(line => /^#\s+\S/.test(line));
	if (h1Index === -1) {
		return `${block}\n\n${body}\n`;
	}

	const head = lines.slice(0, h1Index + 1).join('\n');
	const tail = lines.slice(h1Index + 1).join('\n').replace(/^\n+/, '');
	return tail ? `${head}\n\n${block}\n\n${tail}\n` : `${head}\n\n${block}\n`;
};

/** Ensure AGENTS.md (the hub) carries the managed block at the top. */
const syncHub = (root: string): boolean => {
	try {
		const filePath = path.join(root, HUB_FILE);
		const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
		backupPristineFile(filePath, existing, BLOCK_START);
		return writeFileIfChanged(filePath, upsertBlockAtTop(existing, buildManagedBlock()));
	} catch (error) {
		console.error(`[my-memory] sync ${HUB_FILE} failed:`, error);
		return false;
	}
};

/**
 * Ensure CLAUDE.md imports AGENTS.md. If the `@AGENTS.md` line is already
 * present anywhere we leave the file untouched; otherwise we prepend it,
 * keeping the user's own Claude-specific notes below it.
 */
const syncClaudePointer = (root: string): boolean => {
	try {
		const filePath = path.join(root, CLAUDE_FILE);
		const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

		const alreadyImports = existing.split('\n').some(line => line.trim() === CLAUDE_IMPORT_LINE);
		if (alreadyImports) {
			return true;
		}

		backupPristineFile(filePath, existing, CLAUDE_IMPORT_LINE);
		const next = existing.trim().length
			? `${CLAUDE_IMPORT_LINE}\n\n${existing.trimStart()}`
			: `${CLAUDE_IMPORT_LINE}\n`;
		return writeFileIfChanged(filePath, next);
	} catch (error) {
		console.error(`[my-memory] sync ${CLAUDE_FILE} failed:`, error);
		return false;
	}
};

/**
 * Sync the instruction files for one launching CLI. Every CLI reads the hub, so
 * AGENTS.md is always kept current; Claude additionally needs CLAUDE.md to
 * import it. We never create CLAUDE.md for a CLI that doesn't need it.
 */
export const syncInstructionFileForSlug = (root: string, slug: string | undefined): string[] => {
	const updated: string[] = [];
	if (syncHub(root)) {
		updated.push(HUB_FILE);
	}
	if (slug === CLAUDE_SLUG && syncClaudePointer(root)) {
		updated.push(CLAUDE_FILE);
	}
	return updated;
};

/** Sync every instruction file at once (used on rebuild): hub + Claude pointer. */
export const syncAllInstructionFiles = (root: string): string[] => {
	const updated: string[] = [];
	if (syncHub(root)) {
		updated.push(HUB_FILE);
	}
	if (syncClaudePointer(root)) {
		updated.push(CLAUDE_FILE);
	}
	return updated;
};

/** Strip the managed block from AGENTS.md and the @AGENTS.md import from CLAUDE.md. */
export const removeAllInstructionBlocks = (root: string): string[] => {
	const removed: string[] = [];

	try {
		const hubPath = path.join(root, HUB_FILE);
		if (fs.existsSync(hubPath)) {
			const content = fs.readFileSync(hubPath, 'utf8');
			const start = content.indexOf(BLOCK_START);
			const end = content.indexOf(BLOCK_END);
			if (start !== -1 && end !== -1 && end > start) {
				const cleaned = (content.slice(0, start) + content.slice(end + BLOCK_END.length))
					.replace(/\n{3,}/g, '\n\n')
					.trim();
				if (cleaned) {
					atomicWriteFile(hubPath, cleaned + '\n');
				} else {
					fs.unlinkSync(hubPath);
				}
				removed.push(HUB_FILE);
			}
		}
	} catch (error) {
		console.error(`[my-memory] remove block from ${HUB_FILE} failed:`, error);
	}

	try {
		const claudePath = path.join(root, CLAUDE_FILE);
		if (fs.existsSync(claudePath)) {
			const content = fs.readFileSync(claudePath, 'utf8');
			const lines = content.split('\n');
			const filtered = lines.filter(line => line.trim() !== CLAUDE_IMPORT_LINE);
			if (filtered.length !== lines.length) {
				const cleaned = filtered.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trim();
				if (cleaned) {
					atomicWriteFile(claudePath, cleaned + '\n');
				} else {
					fs.unlinkSync(claudePath);
				}
				removed.push(CLAUDE_FILE);
			}
		}
	} catch (error) {
		console.error(`[my-memory] remove import from ${CLAUDE_FILE} failed:`, error);
	}

	return removed;
};
