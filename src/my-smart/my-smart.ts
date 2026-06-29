/**
 * Front door for the "Smart + Skills" feature — the only file outside
 * src/my-smart/ that other code (src/my-cli) should import.
 */

export { SmartService } from './core/smart-service';
export { SMART_READY_MESSAGE, SMART_CLEANUP_DELAY_MS } from './core/smart-paths';
export type { SmartPrepResult } from './smart-types';
