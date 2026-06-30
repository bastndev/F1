/**
 * Barrel — single import surface for everything under src/my-plus/.
 * Host-side and webview-side consumers both import from here.
 */

export { SmartService } from './my-smart/my-smart';
export { MemoryService } from './my-memory/my-memory';
export { createSmartSkeleton, type SmartSkeletonController } from './my-smart/webview/smart-skeleton';
