/**
 * ========================================
 * Shortcuts Module - Main Export
 * ========================================
 * 
 * This is the main entry point for the shortcuts module.
 * It exports everything needed by external consumers.
 */

// Export the main webview provider
export { F1WebviewProvider } from './button';

// Export UI components for potential reuse
export { ShortcutsUIManager } from './ui';

// Export data types and utilities
export { MyListUI, type ShortcutItem } from './my-list';

/**
 * ========================================
 * USAGE:
 * ========================================
 * 
 * Instead of importing from individual files:
 * import { F1WebviewProvider } from './disable-enable/shortcuts/button';
 * 
 * Import from the module index:
 * import { F1WebviewProvider } from './disable-enable/shortcuts';
 * 
 * This provides a cleaner API and better encapsulation.
 */