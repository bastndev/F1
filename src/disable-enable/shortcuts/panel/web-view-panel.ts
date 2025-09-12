import * as vscode from 'vscode';
import { MyListUI, ShortcutItem } from '../my-list';

export class ComboCreatorPanel {
  private _extensionUri: vscode.Uri;
  private _onComboCreated?: () => void;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
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

    // Set the panel icon to lightning bolt
    panel.iconPath = {
      light: vscode.Uri.joinPath(this._extensionUri, 'assets', 'images', 'light', 'f1.svg'),
      dark: vscode.Uri.joinPath(this._extensionUri, 'assets', 'images', 'dark', 'f1.svg')
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
            editorControls: this._getAvailableEditorControls(),
            extensionCommands: this._getAvailableExtensionCommands()
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
        const { label, key, description, editorControls, extensionCommands } = comboData;
        
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

        // Validate that exactly one action is selected
        const hasEditorControls = editorControls && editorControls.length > 0;
        const hasExtensionCommands = extensionCommands && extensionCommands.length > 0;
        const totalActions = (editorControls?.length || 0) + (extensionCommands?.length || 0);
        
        if (totalActions === 0) {
            vscode.window.showErrorMessage('Please select one action for this shortcut');
            return;
        }
        
        if (totalActions > 1) {
            vscode.window.showErrorMessage('Please select only one action per shortcut');
            return;
        }

        // Create the new shortcut
        const newShortcut: ShortcutItem = {
            label: label.trim(),
            key: key.trim(),
            description: description?.trim() || '',
            actions: {
                editorControls: editorControls || [],
                extensionCommands: extensionCommands || []
            }
        };

        // Add to the list
        MyListUI.addShortcut(newShortcut);

        // Show confirmation
        const actionType = hasEditorControls ? 'Editor Control' : 'Extension Command';
        
        vscode.window.showInformationMessage(
            `✅ Shortcut "${label}" created successfully! (${actionType})`
        );

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
    return [
      // Editor Visual Features
      { name: 'Minimap', key: 'editor.minimap.enabled', category: 'editor' },
      { name: 'Code Folding', key: 'editor.folding', category: 'editor' },
      { name: 'Line Numbers', key: 'editor.lineNumbers', category: 'editor' },
      { name: 'Cursor Blinking', key: 'editor.cursorBlinking', category: 'editor' },
      { name: 'Color Decorators', key: 'editor.colorDecorators', category: 'editor' },
      { name: 'Indent Guides', key: 'editor.guides.indentation', category: 'editor' },
      { name: 'Sticky Scroll', key: 'editor.stickyScroll.enabled', category: 'editor' },
      { name: 'Cursor Smooth Caret Animation', key: 'editor.cursorSmoothCaretAnimation', category: 'editor' },
      { name: 'Terminal Suggest', key: 'terminal.integrated.suggest.enabled', category: 'editor' },
      
      // UI Features
      { name: 'Bracket LINE Colorization', key: 'editor.guides.bracketPairs', category: 'ui' },
      { name: 'Bracket PAIR Colorization', key: 'editor.bracketPairColorization.enabled', category: 'ui' },
      { name: 'Breadcrumbs', key: 'breadcrumbs.enabled', category: 'ui' },
      { name: 'Compact Folders', key: 'explorer.compactFolders', category: 'ui' },
      { name: 'Panel', key: 'workbench.panel.defaultLocation', category: 'ui' },
      { name: 'Side Bar', key: 'workbench.sideBar.location', category: 'ui' },
      { name: 'Status Bar', key: 'workbench.statusBar.visible', category: 'ui' },
      { name: 'Tabs', key: 'workbench.editor.showTabs', category: 'ui' },
      { name: 'Tree Indent', key: 'workbench.tree.indent', category: 'ui' },
      
      // Formatting & Code Features
      { name: 'Auto Save', key: 'files.autoSave', category: 'formatting' },
      { name: 'Format On Paste', key: 'editor.formatOnPaste', category: 'formatting' },
      { name: 'Format On Save', key: 'editor.formatOnSave', category: 'formatting' },
      { name: 'Format On Type', key: 'editor.formatOnType', category: 'formatting' },
      { name: 'Insert Final Newline', key: 'files.insertFinalNewline', category: 'formatting' },
      { name: 'Trim Trailing Whitespace', key: 'files.trimTrailingWhitespace', category: 'formatting' },
      
      // IntelliSense & Features
      { name: 'Accept Suggestion On Enter', key: 'editor.acceptSuggestionOnEnter', category: 'features' },
      { name: 'Auto Closing Brackets', key: 'editor.autoClosingBrackets', category: 'features' },
      { name: 'Auto Closing Quotes', key: 'editor.autoClosingQuotes', category: 'features' },
      { name: 'Auto Surround Selection', key: 'editor.autoSurround', category: 'features' },
      { name: 'Code Lens', key: 'editor.codeLens', category: 'features' },
      { name: 'Git Auto Fetch', key: 'git.autofetch', category: 'features' },
      { name: 'Git Decorations', key: 'git.decorations.enabled', category: 'features' },
      { name: 'Hover', key: 'editor.hover.enabled', category: 'features' },
      { name: 'IntelliSense', key: 'editor.quickSuggestions', category: 'features' },
      { name: 'Parameter Hints', key: 'editor.parameterHints.enabled', category: 'features' },
      { name: 'Suggest On Trigger Characters', key: 'editor.suggestOnTriggerCharacters', category: 'features' },
      
      // Debugging & Terminal
      { name: 'Debug Console', key: 'debug.console.fontSize', category: 'debugging' },
      { name: 'Inline Values', key: 'debug.inlineValues', category: 'debugging' },
      { name: 'Terminal Cursor Blinking', key: 'terminal.integrated.cursorBlinking', category: 'debugging' }
    ];
  }

  /**
   * Get available extension commands for shortcut creator
   */
  private _getAvailableExtensionCommands(): Array<{name: string, key: string, category: string}> {
    // Get all installed extensions and their commands
    const extensions = vscode.extensions.all.filter(ext => !ext.packageJSON.isBuiltin);
    const commands: Array<{name: string, key: string, category: string}> = [];
    
    extensions.forEach(ext => {
      const packageJSON = ext.packageJSON;
      const extensionName = packageJSON.displayName || packageJSON.name;
      
      // Get commands from package.json
      if (packageJSON.contributes && packageJSON.contributes.commands) {
        packageJSON.contributes.commands.forEach((command: any) => {
          if (command.command && command.title) {
            commands.push({
              name: command.title,
              key: command.command,
              category: extensionName
            });
          }
        });
      }
    });
    
    // Add some common VS Code commands
    const commonCommands = [
      { name: 'Format Document', key: 'editor.action.formatDocument', category: 'VS Code' },
      { name: 'Organize Imports', key: 'editor.action.organizeImports', category: 'VS Code' },
      { name: 'Toggle Terminal', key: 'workbench.action.terminal.toggleTerminal', category: 'VS Code' },
      { name: 'Command Palette', key: 'workbench.action.showCommands', category: 'VS Code' },
      { name: 'Quick Open', key: 'workbench.action.quickOpen', category: 'VS Code' },
      { name: 'Toggle Sidebar', key: 'workbench.action.toggleSidebarVisibility', category: 'VS Code' },
      { name: 'Toggle Panel', key: 'workbench.action.togglePanel', category: 'VS Code' },
      { name: 'Toggle Zen Mode', key: 'workbench.action.toggleZenMode', category: 'VS Code' },
      { name: 'Toggle Full Screen', key: 'workbench.action.toggleFullScreen', category: 'VS Code' }
    ];
    
    return [...commonCommands, ...commands].slice(0, 50); // Limit to 50 commands for performance
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

            .tabs {
                display: flex;
                margin-bottom: 20px;
                background-color: var(--vscode-tab-inactiveBackground);
                border-radius: 6px;
                padding: 4px;
            }

            .tab {
                flex: 1;
                padding: 8px 16px;
                text-align: center;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.2s ease;
                font-weight: 500;
                font-size: 13px;
                text-transform: none;
            }

            .tab.active {
                /* Active tab: stronger background, uppercase and bold text */
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                text-transform: uppercase;
                font-weight: 700;
                letter-spacing: 0.6px;
            }

            .tab:hover {
                background-color: var(--vscode-tab-hoverBackground);
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
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚡ F1 Shortcut Creator</h1>
                <p>Select an action to create a keyboard shortcut</p>
            </div>

            <div class="tabs">
                <div class="tab active" data-type="editor">Editor Controls</div>
                <div class="tab" data-type="extensions">Extension Commands</div>
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
                    <div class="modal-subtitle" id="modalSubtitle">Press your desired key combination</div>
                </div>

                <div class="key-input-container">
                    <input
                        type="text"
                        id="keyInput"
                        class="key-input"
                        placeholder="Press keys..."
                        readonly
                    >
                    <div class="key-hint">Press the key combination and then ENTER to confirm</div>
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
            let currentActionType = 'editor';
            let selectedAction = null;
            let availableActions = { editor: [], extensions: [] };
            let capturedKeys = '';
            let isCapturing = false;

            // Initialize
            document.addEventListener('DOMContentLoaded', function() {
                setupEventListeners();
                requestData();
            });

            function setupEventListeners() {
                // Tab switching
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', function() {
                        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                        this.classList.add('active');
                        currentActionType = this.dataset.type;
                        updateActionsGrid();
                    });
                });

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
                    availableActions = {
                        editor: message.editorControls || [],
                        extensions: message.extensionCommands || []
                    };
                    updateActionsGrid();
                }
            });

            function updateActionsGrid() {
                const container = document.getElementById('actionsGrid');
                const actions = availableActions[currentActionType] || [];

                if (actions.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state">
                            <div class="icon">📝</div>
                            <div class="message">No \${currentActionType} actions available</div>
                            <div class="hint">Try switching to the other tab</div>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = actions.map(action => \`
                    <div class="action-card" data-key="\${action.key}" data-name="\${action.name}" onclick="selectAction('\${action.key}', '\${action.name}', '\${currentActionType}')">
                        <div class="action-icon">\${getActionIcon(action, currentActionType)}</div>
                        <div class="action-content">
                            <div class="action-name">\${action.name}</div>
                            <div class="action-category">\${action.category || currentActionType}</div>
                        </div>
                    </div>
                \`).join('');
            }

            function getActionIcon(action, type) {
                if (type === 'editor') {
                    const categoryIcons = {
                        'editor': '📝',
                        'ui': '🎨',
                        'formatting': '📏',
                        'features': '⚡',
                        'debugging': '🐛'
                    };
                    return categoryIcons[action.category] || '⚙️';
                } else {
                    return '🔌';
                }
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

                // Prepare data based on action type
                const shortcutData = {
                    label: selectedAction.name,
                    key: capturedKeys,
                    description: \`Toggle \${selectedAction.name}\`,
                    editorControls: selectedAction.type === 'editor' ? [selectedAction.key] : [],
                    extensionCommands: selectedAction.type === 'extensions' ? [selectedAction.key] : []
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
}
