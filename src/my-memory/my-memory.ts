/**
 * Front door for the "My Memory" feature — the only file outside src/my-memory/
 * that other code (src/my-cli, src/extension.ts) should import.
 *
 * Host-side (Node) exports only. The webview button handler lives under
 * src/my-cli/webview/ for build-target reasons; shared message types live in
 * src/my-cli/shared/memory-types.ts (the host↔webview protocol surface).
 */

export { MemoryService } from './core/memory-service';
export type { MemorySnapshot, MemoryBuildResult, MemoryStatus } from '../my-cli/shared/memory-types';
