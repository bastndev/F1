/**
 * Barrel — single import surface for everything under src/my-plus/.
 * Host-side and webview-side consumers both import from here.
 */

export { SmartService } from './my-smart/my-smart';
export { SMART_READY_MESSAGE, SMART_READY_MARKER } from './my-smart/core/smart-paths';
export { MemoryService } from './my-memory/my-memory';
export { createSmartSkeleton, type SmartSkeletonController } from './my-smart/webview/smart-skeleton';
