import * as vscode from 'vscode';
import * as path from 'path';
import { MyListUI, ShortcutItem } from '../my-list/user-shortcuts';
import { DynamicShortcutManager } from '../my-list/dynamic';
import { getAvailableEditorControls } from './ed-content';

export class ComboCreatorPanel {
  private _extensionUri: vscode.Uri;
  private _onComboCreated?: () => void;
  private _context?: vscode.ExtensionContext;

  constructor(extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
    this._extensionUri = extensionUri;
    this._context = context;
  }

  /**
   * Set callback for when a combo is created
   */
  public setOnComboCreated(callback: () => void): void {
    this._onComboCreated = callback;
  }

  /**
   * Show the combo creator panel
   */
  public showComboCreator(): void {
    const panel = vscode.window.createWebviewPanel(
      'f1ShortcutCreator',
      'F1 Shortcut Creator',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri]
      }
    );

    // Set the panel icon to lightning bolt SVG
    panel.iconPath = {
      light: vscode.Uri.joinPath(this._extensionUri, 'assets', 'svg', 'f2.svg'),
      dark: vscode.Uri.joinPath(this._extensionUri, 'assets', 'svg', 'f2.svg')
    };

    panel.webview.html = this._getComboCreatorHTML();
    this._setupComboCreatorHandling(panel);
  }

  /**
   * Setup message handling for combo creator
   */
  private _setupComboCreatorHandling(panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'createCombo':
          await this._createCombo(data.value);
          panel.dispose();
          break;
        case 'cancel':
          panel.dispose();
          break;
        case 'getComboData':
          // Send available data to the combo creator
          panel.webview.postMessage({
            type: 'comboData',
            editorControls: this._getAvailableEditorControls()
          });
          break;
      }
    });
  }

/**
 * Create a new combo
 */
private async _createCombo(comboData: any): Promise<void> {
    try {
        const { label, key, description, editorControls } = comboData;
        
        // Validate required fields
        if (!label || !key) {
            vscode.window.showErrorMessage('Please fill in all required fields (Name and Shortcut Key)');
            return;
        }

        // Validate that the shortcut does not exist
        if (MyListUI.shortcutExists(key)) {
            vscode.window.showErrorMessage(`Shortcut ${key} already exists! Please choose a different key combination.`);
            return;
        }

        // Validate that exactly one editor control is selected
        if (!editorControls || editorControls.length === 0) {
            vscode.window.showErrorMessage('Please select one editor control for this shortcut');
            return;
        }
        
        if (editorControls.length > 1) {
            vscode.window.showErrorMessage('Please select only one editor control per shortcut');
            return;
        }

        // Create the new shortcut
        const newShortcut: ShortcutItem = {
            label: label.trim(),
            key: key.trim(),
            description: description?.trim() || '',
            actions: {
                editorControls: editorControls,
                extensionCommands: [],
                installedExtensions: []
            }
        };

        // Add to the list
        MyListUI.addShortcut(newShortcut);

        // Check if the key combination is supported
        const isValidFKey = this._isValidFKeyCombo(key.trim());
        
        if (isValidFKey) {
            vscode.window.showInformationMessage(
                `✅ Shortcut "${label}" created! Press ${key} to toggle ${label}.`
            );
        } else {
            vscode.window.showErrorMessage(
                `❌ Invalid key combination! Only F1-F12 combinations are allowed: ctrl+f1-f12, alt+f1-f12, shift+f1-f12`
            );
            return;
        }

        // Call the callback to refresh the main view
        if (this._onComboCreated) {
            this._onComboCreated();
        }

    } catch (error) {
        console.error('Error creating combo:', error);
        vscode.window.showErrorMessage(`Error creating combo: ${error}`);
    }
}


  /**
   * Get available editor controls for shortcut creator
   */
  private _getAvailableEditorControls(): Array<{name: string, key: string, category: string}> {
    return getAvailableEditorControls();
  }

  /**
   * Generate HTML for shortcut creator
   */
  private _getComboCreatorHTML(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>F1 Shortcut Creator</title>
        <!-- VS Code Codicons -->
        <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: var(--vscode-font-family);
                background-color: var(--vscode-editor-background);
                color: var(--vscode-foreground);
                height: 100vh;
                overflow: hidden;
            }

            .container {
                padding: 20px;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }

            .header {
                text-align: center;
                margin-bottom: 30px;
            }

            .header h1 {
                font-size: 24px;
                font-weight: 700;
                color: var(--vscode-foreground);
                margin-bottom: 8px;
            }

            .header p {
                color: var(--vscode-descriptionForeground);
                font-size: 14px;
            }

            .actions-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 15px;
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            }

            .action-card {
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-widget-border);
                border-radius: 8px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .action-card:hover {
                background-color: var(--vscode-list-hoverBackground);
                border-color: var(--vscode-focusBorder);
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }

            .action-icon {
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                border-radius: 6px;
                flex-shrink: 0;
                transition: background-color 0.2s ease, color 0.2s ease;
            }

            .extension-icon {
                width: 24px;
                height: 24px;
                border-radius: 4px;
                object-fit: contain;
            }

            .action-content {
                flex: 1;
            }

            .action-name {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 4px;
                color: var(--vscode-foreground);
            }

            .action-category {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* Modal Styles */
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                animation: fadeIn 0.2s ease;
            }

            .modal.show {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .modal-content {
                background-color: var(--vscode-quickInput-background);
                border: 1px solid var(--vscode-widget-border);
                border-radius: 8px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
                animation: slideIn 0.2s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes slideIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            .modal-header {
                text-align: center;
                margin-bottom: 20px;
            }

            .modal-title {
                font-size: 18px;
                font-weight: 700;
                color: var(--vscode-foreground);
                margin-bottom: 8px;
            }

            .modal-subtitle {
                color: var(--vscode-descriptionForeground);
                font-size: 13px;
            }

            .key-input-container {
                margin-bottom: 20px;
            }

            .key-input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 6px;
                font-size: 16px;
                font-family: 'Courier New', monospace;
                text-align: center;
                font-weight: 600;
                transition: all 0.2s ease;
            }

            .key-input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
                box-shadow: 0 0 0 2px var(--vscode-focusBorder);
            }

            .key-input.capturing {
                border-color: var(--vscode-button-background);
                background-color: var(--vscode-editor-background);
                animation: pulse 1s infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }

            .key-hint {
                text-align: center;
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-top: 8px;
                font-style: italic;
            }

            .modal-buttons {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }

            .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .btn-primary {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }

            .btn-primary:hover {
                background-color: var(--vscode-button-hoverBackground);
                transform: translateY(-1px);
            }

            .btn-secondary {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-widget-border);
            }

            .btn-secondary:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }

            .loading {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: var(--vscode-descriptionForeground);
                grid-column: 1 / -1;
            }

            .empty-state .icon {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.6;
            }

            .empty-state .message {
                font-size: 16px;
                margin-bottom: 8px;
                font-weight: 600;
            }

            .empty-state .hint {
                font-size: 13px;
                opacity: 0.8;
            }
            .action-card:hover .action-icon {
                 background-color: var(--vscode-button-background);
                 color: var(--vscode-button-foreground);
            }

        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>F1 Shortcut Creator</h1>
                <p>Select an action and assign a F1-F12 keyboard shortcut</p>
                <div style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 6px; margin: 8px 0; border-left: 3px solid var(--vscode-notificationCenterHeader-foreground);">
                    <div style="font-size: 13px; color: var(--vscode-foreground); margin-bottom: 4px;"><strong>📝 Allowed combinations:</strong></div>
                    <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                        • <strong>Ctrl + F1-F12</strong> (ctrl+f1, ctrl+f2, ..., ctrl+f12)<br>
                        • <strong>Alt + F1-F12</strong> (alt+f1, alt+f2, ..., alt+f12)<br>
                        • <strong>Shift + F1-F12</strong> (shift+f1, shift+f2, ..., shift+f12)
                    </div>
                </div>
            </div>

            <div class="actions-grid" id="actionsGrid">
                <div class="empty-state">
                    <div class="icon">⚡</div>
                    <div class="message">Loading actions...</div>
                    <div class="hint">Please wait while we load available actions</div>
                </div>
            </div>
        </div>

        <!-- Modal for shortcut capture -->
        <div class="modal" id="shortcutModal">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="modal-title" id="modalTitle">Create Shortcut</div>
                    <div class="modal-subtitle" id="modalSubtitle">Press Ctrl/Alt/Shift + F1-F12 combination</div>
                </div>

                <div class="key-input-container">
                    <input
                        type="text"
                        id="keyInput"
                        class="key-input"
                        placeholder="e.g. ctrl+f1, alt+f5, shift+f12..."
                        readonly
                    >
                    <div class="key-hint">Only F1-F12 combinations allowed (ctrl+f1-f12, alt+f1-f12, shift+f1-f12)</div>
                </div>

                <div class="modal-buttons">
                    <button class="btn btn-secondary" onclick="closeModal()">
                        Cancel
                    </button>
                    <button class="btn btn-primary" onclick="createShortcut()" id="createBtn">
                        Create Shortcut
                    </button>
                </div>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            let selectedAction = null;
            let availableActions = [];
            let capturedKeys = '';
            let isCapturing = false;

            // Initialize
            document.addEventListener('DOMContentLoaded', function() {
                setupEventListeners();
                requestData();
            });

            function setupEventListeners() {
                // Key capture for modal
                document.addEventListener('keydown', handleKeyCapture);
            }

            function requestData() {
                vscode.postMessage({ type: 'getComboData' });
            }

            // Handle data from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'comboData') {
                    availableActions = message.editorControls || [];
                    updateActionsGrid();
                }
            });

            function updateActionsGrid() {
                const container = document.getElementById('actionsGrid');
                const actions = availableActions;

                if (actions.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state">
                            <div class="icon">📝</div>
                            <div class="message">No editor controls available</div>
                            <div class="hint">Please check your configuration</div>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = actions.map(action => \`
                    <div class="action-card" data-key="\${action.key}" data-name="\${action.name}" onclick="selectAction('\${action.key}', '\${action.name}', 'editor')">
                        <div class="action-icon">\${getActionIcon(action, 'editor')}</div>
                        <div class="action-content">
                            <div class="action-name">\${action.name}</div>
                            <div class="action-category">\${action.category}</div>
                        </div>
                    </div>
                \`).join('');
            }

            function getActionIcon(action, type) {
                const iconMap = {
                    'editor': 'edit',
                    'ui': 'layout',
                    'formatting': 'symbol-ruler',
                    'features': 'zap',
                    'debugging': 'debug-alt'
                };
                const icon = iconMap[action.category] || 'gear';
                return \`<span class="codicon codicon-\${icon}"></span>\`;
            }

            function selectAction(key, name, type) {
                selectedAction = { key, name, type };
                document.getElementById('modalTitle').textContent = \`Shortcut for "\${name}"\`;
                document.getElementById('modalSubtitle').textContent = 'Press your desired key combination';
                document.getElementById('keyInput').value = '';
                capturedKeys = '';
                showModal();
            }

            function showModal() {
                const modal = document.getElementById('shortcutModal');
                modal.classList.add('show');
                document.getElementById('keyInput').focus();
                startKeyCapture();
            }

            function closeModal() {
                const modal = document.getElementById('shortcutModal');
                modal.classList.remove('show');
                stopKeyCapture();
                selectedAction = null;
                capturedKeys = '';
            }

            function startKeyCapture() {
                isCapturing = true;
                const input = document.getElementById('keyInput');
                input.classList.add('capturing');
                input.placeholder = 'Press keys now...';
            }

            function stopKeyCapture() {
                isCapturing = false;
                const input = document.getElementById('keyInput');
                input.classList.remove('capturing');
                input.placeholder = 'Press keys...';
            }

            function handleKeyCapture(event) {
                if (!isCapturing) return;

                event.preventDefault();
                event.stopPropagation();

                if (event.key === 'Enter' && capturedKeys) {
                    stopKeyCapture();
                    return;
                }

                if (event.key === 'Escape') {
                    closeModal();
                    return;
                }

                const keys = [];
                if (event.ctrlKey) keys.push('Ctrl');
                if (event.altKey) keys.push('Alt');
                if (event.shiftKey) keys.push('Shift');
                if (event.metaKey) keys.push('Cmd');

                if (event.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
                    keys.push(event.key.toUpperCase());
                }

                capturedKeys = keys.join('+');
                document.getElementById('keyInput').value = capturedKeys;
            }

            function createShortcut() {
                if (!selectedAction) {
                    alert('Please select an action first');
                    return;
                }

                if (!capturedKeys) {
                    alert('Please capture a key combination');
                    document.getElementById('keyInput').focus();
                    return;
                }

                // Show loading state
                const btn = document.getElementById('createBtn');
                const originalText = btn.innerHTML;
                btn.innerHTML = '⏳ Creating...';
                btn.classList.add('loading');
                btn.disabled = true;

                // Prepare data for editor control
                const shortcutData = {
                    label: selectedAction.name,
                    key: capturedKeys,
                    description: \`Toggle \${selectedAction.name}\`,
                    editorControls: [selectedAction.key],
                    extensionCommands: [],
                    installedExtensions: []
                };

                vscode.postMessage({
                    type: 'createCombo',
                    value: shortcutData
                });

                // Close modal and reset after delay
                setTimeout(() => {
                    closeModal();
                    btn.innerHTML = originalText;
                    btn.classList.remove('loading');
                    btn.disabled = false;
                }, 2000);
            }
        </script>
    </body>
    </html>`;
  }

  /**
   * Validate if the key combination is a valid F1-F12 combination
   */
  private _isValidFKeyCombo(key: string): boolean {
    const normalizedKey = key.toLowerCase();
    
    // Valid patterns: ctrl+f1-f12, alt+f1-f12, shift+f1-f12
    const validPatterns = [
      /^ctrl\+f([1-9]|1[0-2])$/,
      /^alt\+f([1-9]|1[0-2])$/,
      /^shift\+f([1-9]|1[0-2])$/
    ];
    
    return validPatterns.some(pattern => pattern.test(normalizedKey));
  }
}
