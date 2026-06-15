/**
 * Front door for the "My Memory" feature.
 * Host-side exports only — webview code stays in src/my-cli/webview/.
 */

export { MemoryService } from '../my-cli/host/memory/memory-service';
export type { MemorySnapshot, MemoryBuildResult, MemoryStatus } from '../my-cli/shared/memory-types';
