/**
 * Standalone pre-commit runner for "My Memory".
 *
 * Invoked by the git pre-commit hook — a separate process from the extension —
 * so it reuses MemoryService directly instead of reimplementing the sync logic
 * in shell (which would drift). When the project is stale it refreshes `.f1/`
 * and stages the managed files into the in-progress commit, so each commit ships
 * a context map that matches its code.
 *
 * Contract: it touches only the files it owns (`.f1/`, AGENTS.md, CLAUDE.md) and
 * ALWAYS exits 0 — a context build must never block the user's commit.
 *
 * Node-only entry point (its own esbuild target); no `vscode`.
 */

import { spawnSync } from 'child_process';
import { MemoryService } from '../core/memory-service';

const finish = (): never => process.exit(0);

const main = async (): Promise<void> => {
	const root = process.cwd();
	const service = new MemoryService();
	service.setEnabled(true);

	const snapshot = service.getSnapshot(root);
	// Nothing to refresh (fresh, never built, or no engine) → leave the commit alone.
	if (!snapshot.stale || !snapshot.hasGraphify) {
		finish();
	}

	const result = await service.rebuild(root);
	if (result.success) {
		// Stage ONLY our managed paths — never the user's other changes.
		spawnSync('git', ['add', '--', '.f1', 'AGENTS.md', 'CLAUDE.md'], { cwd: root });
	}
	finish();
};

main().catch(() => finish());
