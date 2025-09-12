import { MyListUI } from './my-list';

export class ShortcutsUIManager {
  // ==========================================
  // CSS STYLES SECTION
  // ==========================================

  /**
   * Main container and layout styles
   */
  private static getLayoutStyles(): string {
    return `
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                margin: 0;
                padding: 10px;
                height: 100vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .section-title {
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--vscode-foreground);
                font-size: 12px;
                text-transform: uppercase;
                flex-shrink: 0;
            }
        `;
  }

  /**
   * Button component styles (Combine button)
   */
  private static getButtonStyles(): string {
    return `
            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                margin-bottom: 15px;
                flex-shrink: 0;
            }

            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }

        `;
  }

  /**
   * Enhanced shortcuts list component styles
   */
  private static getShortcutsListStyles(): string {
    return `
            .shortcuts-container {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
            }

            .shortcut-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                border-radius: 4px;
                margin-bottom: 6px;
                background-color: var(--vscode-list-hoverBackground);
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .shortcut-item:hover {
                background-color: var(--vscode-list-activeSelectionBackground);
                transform: translateX(2px);
            }

            .shortcut-content {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex: 1;
            }

            .shortcut-label {
                font-weight: 500;
                color: var(--vscode-foreground);
            }

            .shortcut-description {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            }


            .shortcut-key {
                font-family: monospace;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
            }

            .default {
                border-left: 3px solid var(--vscode-button-background);
                opacity: 0.8;
                cursor: default;
                background-color: var(--vscode-editor-background);
            }

            .default:hover {
                background-color: var(--vscode-editor-background);
                opacity: 0.9;
                transform: none;
            }

            .user-line {
                border-top: 1px solid var(--vscode-widget-border);
                width: 100%;
                margin: 12px 0;
            }

            .user-delete:hover {
                border-left: 3px solid #ff002b;
                background-color: var(--vscode-inputValidation-errorBackground);
            }


        `;
  }

  /**
   * Combines all CSS styles into a single string
   */
  public static getAllStyles(): string {
    return `
            /* ========== LAYOUT STYLES ========== */
            ${this.getLayoutStyles()}

            /* ========== BUTTON COMPONENT ========== */
            ${this.getButtonStyles()}

            /* ========== SHORTCUTS LIST COMPONENT ========== */
            ${this.getShortcutsListStyles()}
        `;
  }

  // ==========================================
  // JAVASCRIPT SECTION
  // ==========================================

  /**
   * Client-side JavaScript for webview interactions
   */
  public static getWebviewScript(): string {
    return `
            // VSCode API initialization
            const vscode = acquireVsCodeApi();

            /**
             * Send message to extension host
             * @param {string} type - Message type
             * @param {any} value - Optional message payload
             */
            function sendMessage(type, value = null) {
                vscode.postMessage({ type, value });
            }

            /**
             * Execute a command by sending message to extension
             * @param {string} command - Command name to execute
             */
            function executeCommand(command) {
                sendMessage('execute', command);
            }

            /**
             * Show confirmation dialog for deleting a shortcut
             * @param {number} index - Index of the shortcut to delete
             * @param {string} label - Label of the shortcut for confirmation message
             */
            function confirmDelete(index, label) {
                sendMessage('confirmDelete', { index, label });
            }

            /**
             * Execute a shortcut by ID
             * @param {string} shortcutId - ID of the shortcut to execute
             */
            function executeShortcut(shortcutId) {
                sendMessage('execute', shortcutId);
            }
        `;
  }

  // ==========================================
  // HTML COMPONENTS SECTION
  // ==========================================

  /**
   * Generate the action buttons HTML
   */
  private static getActionButtonsHTML(): string {
    return `
            <button class="button" onclick="sendMessage('commit')">
                Create Shortcut
            </button>
        `;
  }

  /**
   * Generate the My List section HTML
   */
  private static getMyListSectionHTML(): string {
    return `
            <div class="section-title">My List</div>
            ${MyListUI.generateShortcutsHTML()}
        `;
  }

  // ==========================================
  // MAIN HTML GENERATOR
  // ==========================================

  /**
   * Generate complete HTML for the webview
   * This is the main entry point for UI generation
   */
  public static generateWebviewHTML(): string {
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>F1 Shortcuts</title>
            <style>
                ${this.getAllStyles()}
            </style>
        </head>
        <body>
            <!-- ========== ACTION BUTTONS SECTION ========== -->
            ${this.getActionButtonsHTML()}

            <!-- ========== MY LIST SECTION ========== -->
            ${this.getMyListSectionHTML()}

            <!-- ========== WEBVIEW SCRIPTS ========== -->
            <script>
                ${this.getWebviewScript()}
            </script>
        </body>
        </html>`;
  }
}

/**
 * ========================================
 * USAGE EXAMPLE:
 * ========================================
 *
 * In your webview provider:
 *
 * webviewView.webview.html = ShortcutsUIManager.generateWebviewHTML();
 *
 * ========================================
 * EXTENDING THE UI:
 * ========================================
 *
 * 1. Add new component styles in their own method
 * 2. Add the method to getAllStyles()
 * 3. Create HTML generator method for the component
 * 4. Add to generateWebviewHTML()
 *
 * This keeps everything organized and easy to maintain!
 */

// ==========================================
// MODULE EXPORTS
// ==========================================

// Export the main webview provider
export { F1WebviewProvider } from './button';

// Export data types and utilities
export { MyListUI, type ShortcutItem } from './my-list';