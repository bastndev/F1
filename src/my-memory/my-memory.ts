/**
 * Front door for the "My Memory" feature — the only file outside src/my-memory/
 * that other code (src/my-cli, src/extension.ts) should import.
 *
 * Host-side (Node) exports only. The webview button handler lives under
 * src/my-cli/webview/ for build-target reasons; the host↔webview memory
 * messages live in src/my-cli/shared/protocol.ts, and the snapshot/result
 * types are re-exported below from ./memory-types.
 */

export { MemoryService } from './core/memory-service';
export type { MemorySnapshot, MemoryBuildResult, MemoryStatus } from './memory-types';
