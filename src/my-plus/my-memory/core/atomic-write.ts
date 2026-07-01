/**
 * Safe low-level file writes for "My Memory" / "Smart + Skills".
 *
 * Every write goes through a temp file + rename so a crash mid-write can never
 * leave a half-written instruction file behind. `writeFileIfChanged` skips the
 * write entirely when the bytes already match, to avoid pointless git churn.
 *
 * Pure Node (`fs`/`path`) — no `vscode`. Best-effort: never throws, returns a
 * boolean so callers can keep their own error handling.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Write `content` to `filePath` atomically (temp file + rename). */
export const atomicWriteFile = (filePath: string, content: string, mode?: number): boolean => {
	const dir = path.dirname(filePath);
	const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
	try {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(tmp, content, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
		fs.renameSync(tmp, filePath);
		return true;
	} catch (error) {
		try {
			fs.unlinkSync(tmp);
		} catch {
			/* temp file may not exist */
		}
		console.error('[my-memory] atomic write failed:', error);
		return false;
	}
};

/**
 * Write only if the on-disk content differs. Returns true when the file ends up
 * holding `content` (whether it was rewritten or already matched), false on error.
 */
export const writeFileIfChanged = (filePath: string, content: string): boolean => {
	try {
		if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) {
			return true;
		}
	} catch {
		/* unreadable — fall through and overwrite */
	}
	return atomicWriteFile(filePath, content);
};

/**
 * Copy `filePath` to `filePath.bak` once, before we first modify a user file.
 * Only runs when the file is still pristine (does not yet contain `ownedMarker`)
 * and no backup exists, so the backup always captures the user's own content.
 */
export const backupPristineFile = (filePath: string, content: string, ownedMarker: string): void => {
	try {
		if (!content.trim() || content.includes(ownedMarker)) {
			return;
		}
		const backupPath = `${filePath}.bak`;
		if (!fs.existsSync(backupPath)) {
			fs.copyFileSync(filePath, backupPath);
		}
	} catch (error) {
		console.error('[my-memory] backup failed:', error);
	}
};

/**
 * Remove the `.bak` created by `backupPristineFile` once the managed block has
 * been stripped and the user's content restored — the backup is then redundant.
 * Best-effort: never throws.
 */
export const removeBackupIfExists = (filePath: string): void => {
	const backupPath = `${filePath}.bak`;
	try {
		if (fs.existsSync(backupPath)) {
			fs.unlinkSync(backupPath);
		}
	} catch (error) {
		console.error(`[my-memory] remove backup ${backupPath} failed:`, error);
	}
};
