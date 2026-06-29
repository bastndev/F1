/**
 * "Smart + Skills" host constants.
 * Pure data — no vscode, no fs, no DOM. Safe to import from anywhere.
 */

/** Shown in the terminal once context + rules are in place. */
export const SMART_READY_MESSAGE = 'I am ready for work ✅';

/**
 * How long after launch to keep the generated `.f1/` before auto-cleaning it —
 * long enough for the CLI to boot and read its instruction files, after which
 * the context has served its purpose. (Phase 2 heuristic; Phase 3 will make this
 * event-driven via the custom skeleton.)
 */
export const SMART_CLEANUP_DELAY_MS = 6000;
