/**
 * "Smart + Skills" orchestrator (host / Node).
 *
 * On a Smart-mode launch it drives my-memory's slim engine: write the built-in
 * rules into `.f1/`, ensure a cheap project map, and point AGENTS.md/CLAUDE.md
 * at both — so the CLI starts with rules + context. After the session is up the
 * host auto-cleans the generated `.f1/` (it has served its purpose).
 *
 * Nothing is created on toggle — only on launch. Delivery is passive (the CLI
 * reads its own instruction files), so it can't break on a not-logged-in CLI.
 */

import { MemoryService } from '../../my-memory/my-memory';
import type { SmartPrepResult } from '../smart-types';

export class SmartService {
	private readonly memory = new MemoryService();

	/**
	 * Write rules + ensure the project map + point the instruction files at them.
	 * Cheap and synchronous (no graph build); never throws.
	 */
	public prepareLaunch(
		root: string | undefined,
		slug: string | undefined,
		rulesContent: string | undefined
	): SmartPrepResult {
		if (!root) {
			return { ok: false, rulesWritten: false };
		}

		this.memory.setEnabled(true);
		const rulesWritten = rulesContent ? this.memory.writeRules(root, rulesContent) : false;
		this.memory.onLaunch(root, slug);
		return { ok: true, rulesWritten };
	}

	/** Remove the generated `.f1/` and strip our blocks from the instruction files. */
	public cleanup(root: string | undefined): void {
		this.memory.cleanup(root);
	}
}
