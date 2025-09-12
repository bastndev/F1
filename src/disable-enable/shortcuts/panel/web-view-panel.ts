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
                display: flex;
                height: 100vh;
            }
            
            .sidebar {
                width: 320px;
                background-color: var(--vscode-sideBar-background);
                border-right: 1px solid var(--vscode-widget-border);
                display: flex;
                flex-direction: column;
            }
            
            .main-content {
                flex: 1;
                padding: 24px;
                overflow-y: auto;
                background-color: var(--vscode-editor-background);
            }
            
            .header {
                padding: 20px;
                border-bottom: 1px solid var(--vscode-widget-border);
                background: linear-gradient(135deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
            }
            
            .header h1 {
                font-size: 18px;
                font-weight: 700;
                color: var(--vscode-button-foreground);
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .key-capture-section {
                padding: 20px;
                border-bottom: 1px solid var(--vscode-widget-border);
                background-color: var(--vscode-input-background);
            }
            
            .key-capture-label {
                display: block;
                margin-bottom: 12px;
                font-weight: 600;
                font-size: 14px;
                color: var(--vscode-foreground);
            }
            
            .key-capture-container {
                position: relative;
            }
            
            .key-capture-input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 6px;
                font-size: 14px;
                font-family: 'Courier New', monospace;
                text-align: center;
                font-weight: 600;
                transition: all 0.3s ease;
            }
            
            .key-capture-input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
                box-shadow: 0 0 0 2px var(--vscode-focusBorder);
                background-color: var(--vscode-editor-background);
            }
            
            .key-capture-input.capturing {
                border-color: var(--vscode-button-background);
                background-color: var(--vscode-editor-background);
                animation: pulse 1.5s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            .key-capture-hint {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-top: 8px;
                text-align: center;
                font-style: italic;
            }
            
            .action-type {
                padding: 16px 20px;
                border-bottom: 1px solid var(--vscode-widget-border);
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 12px;
                position: relative;
            }
            
            .action-type:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            
            .action-type.active {
                background-color: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
                border-left: 4px solid var(--vscode-button-background);
            }
            
            .action-type .icon {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }
            
            .action-type .label {
                font-weight: 600;
                font-size: 14px;
            }
            
            .action-list {
                flex: 1;
                overflow-y: auto;
                padding: 8px 0;
            }
            
            .action-item {
                padding: 12px 20px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 12px;
                border-left: 3px solid transparent;
                position: relative;
            }
            
            .action-item:hover {
                background-color: var(--vscode-list-hoverBackground);
                transform: translateX(2px);
            }
            
            .action-item.selected {
                background-color: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
                border-left-color: var(--vscode-button-background);
                box-shadow: inset 0 0 0 1px var(--vscode-button-background);
            }
            
            .action-item .radio {
                width: 18px;
                height: 18px;
                border: 2px solid var(--vscode-checkbox-border);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                flex-shrink: 0;
            }
            
            .action-item.selected .radio {
                border-color: var(--vscode-button-background);
                background-color: var(--vscode-button-background);
            }
            
            .action-item.selected .radio::after {
                content: '';
                width: 8px;
                height: 8px;
                background-color: var(--vscode-button-foreground);
                border-radius: 50%;
            }
            
            .action-item .icon {
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                flex-shrink: 0;
            }
            
            .action-item .name {
                flex: 1;
                font-size: 14px;
                font-weight: 500;
            }
            
            .action-item .category {
                font-size: 11px;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 3px 8px;
                border-radius: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .preview-section {
                background: linear-gradient(135deg, var(--vscode-editor-background), var(--vscode-input-background));
                border: 2px solid var(--vscode-widget-border);
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 24px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            }
            
            .preview-title {
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 16px;
                color: var(--vscode-foreground);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .preview-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid var(--vscode-widget-border);
            }
            
            .preview-item:last-child {
                border-bottom: none;
            }
            
            .preview-item .label {
                font-size: 13px;
                color: var(--vscode-descriptionForeground);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .preview-item .value {
                font-size: 14px;
                color: var(--vscode-foreground);
                font-family: 'Courier New', monospace;
                font-weight: 600;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 4px 8px;
                border-radius: 4px;
            }
            
            .buttons {
                display: flex;
                gap: 16px;
                justify-content: flex-end;
            }
            
            .btn {
                padding: 12px 24px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .btn-primary {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            }
            
            .btn-primary:hover {
                background-color: var(--vscode-button-hoverBackground);
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            }
            
            .btn-primary:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            
            .btn-secondary {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-widget-border);
            }
            
            .btn-secondary:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
                transform: translateY(-1px);
            }
            
            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: var(--vscode-descriptionForeground);
            }
            
            .empty-state .icon {
                font-size: 64px;
                margin-bottom: 20px;
                opacity: 0.6;
            }
            
            .empty-state .message {
                font-size: 16px;
                margin-bottom: 12px;
                font-weight: 600;
            }
            
            .empty-state .hint {
                font-size: 13px;
                opacity: 0.8;
                font-style: italic;
            }
            
            .search-box {
                padding: 16px 20px;
                border-bottom: 1px solid var(--vscode-widget-border);
            }
            
            .search-input {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                font-size: 13px;
            }
            
            .search-input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="sidebar">
                <div class="header">
                    <h1>⚡ Create Shortcut</h1>
                </div>
                
                <div class="key-capture-section">
                    <label class="key-capture-label">🎯 Shortcut Key Combination</label>
                    <div class="key-capture-container">
                        <input 
                            type="text" 
                            id="shortcutKey" 
                            class="key-capture-input"
                            placeholder="Press keys to capture..."
                            readonly
                        >
                        <div class="key-capture-hint">Press desired key combination and then press ENTER</div>
                    </div>
                </div>
                
                <div class="action-type active" data-type="editor">
                    <div class="icon">⚙️</div>
                    <div class="label">Editor Controls</div>
                </div>
                
                <div class="action-type" data-type="extensions">
                    <div class="icon">🔌</div>
                    <div class="label">Extension Commands</div>
                </div>
                
                <div class="search-box">
                    <input 
                        type="text" 
                        id="searchInput" 
                        class="search-input"
                        placeholder="🔍 Search actions..."
                    >
                </div>
                
                <div class="action-list" id="actionList">
                    <div class="empty-state">
                        <div class="icon">⚡</div>
                        <div class="message">Loading actions...</div>
                        <div class="hint">Please wait while we load available actions</div>
                    </div>
                </div>
            </div>
            
            <div class="main-content">
                <div class="preview-section">
                    <div class="preview-title">📋 Shortcut Preview</div>
                    <div class="preview-item">
                        <span class="label">Name:</span>
                        <span class="value" id="previewName">Select an action</span>
                    </div>
                    <div class="preview-item">
                        <span class="label">Key:</span>
                        <span class="value" id="previewKey">Press keys</span>
                    </div>
                    <div class="preview-item">
                        <span class="label">Action:</span>
                        <span class="value" id="previewAction">None selected</span>
                    </div>
                </div>
                
                <div class="buttons">
                    <button class="btn btn-secondary" onclick="cancel()">
                        ❌ Cancel
                    </button>
                    <button class="btn btn-primary" onclick="createShortcut()" id="createBtn">
                        ✨ Create Shortcut
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
                // Action type switching
                document.querySelectorAll('.action-type').forEach(type => {
                    type.addEventListener('click', function() {
                        document.querySelectorAll('.action-type').forEach(t => t.classList.remove('active'));
                        this.classList.add('active');
                        currentActionType = this.dataset.type;
                        updateActionList();
                    });
                });
                
                // Key capture functionality
                const keyInput = document.getElementById('shortcutKey');
                keyInput.addEventListener('focus', startKeyCapture);
                keyInput.addEventListener('blur', stopKeyCapture);
                
                // Search functionality
                document.getElementById('searchInput').addEventListener('input', filterActions);
                
                // Global key capture
                document.addEventListener('keydown', handleKeyCapture);
            }
            
            function startKeyCapture() {
                isCapturing = true;
                capturedKeys = '';
                const input = document.getElementById('shortcutKey');
                input.classList.add('capturing');
                input.placeholder = 'Press keys now...';
            }
            
            function stopKeyCapture() {
                isCapturing = false;
                const input = document.getElementById('shortcutKey');
                input.classList.remove('capturing');
                input.placeholder = 'Press keys to capture...';
            }
            
            function handleKeyCapture(event) {
                if (!isCapturing) return;
                
                event.preventDefault();
                event.stopPropagation();
                
                if (event.key === 'Enter') {
                    stopKeyCapture();
                    updatePreview();
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
                document.getElementById('shortcutKey').value = capturedKeys;
            }
            
            function filterActions() {
                const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                const actionItems = document.querySelectorAll('.action-item');
                
                actionItems.forEach(item => {
                    const name = item.dataset.name.toLowerCase();
                    const category = item.querySelector('.category').textContent.toLowerCase();
                    
                    if (name.includes(searchTerm) || category.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
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
                    updateActionList();
                }
            });
            
            function updateActionList() {
                const container = document.getElementById('actionList');
                const actions = availableActions[currentActionType] || [];
                
                if (actions.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state">
                            <div class="icon">📝</div>
                            <div class="message">No \${currentActionType} available</div>
                            <div class="hint">Try switching to the other category</div>
                        </div>
                    \`;
                    return;
                }
                
                container.innerHTML = actions.map(action => \`
                    <div class="action-item" data-key="\${action.key}" data-name="\${action.name}">
                        <div class="radio"></div>
                        <div class="icon">\${getActionIcon(action, currentActionType)}</div>
                        <div class="name">\${action.name}</div>
                        <div class="category">\${action.category || currentActionType}</div>
                    </div>
                \`).join('');
                
                // Add click listeners
                container.querySelectorAll('.action-item').forEach(item => {
                    item.addEventListener('click', function() {
                        // Remove previous selection
                        container.querySelectorAll('.action-item').forEach(i => i.classList.remove('selected'));
                        // Select current
                        this.classList.add('selected');
                        selectedAction = {
                            key: this.dataset.key,
                            name: this.dataset.name,
                            type: currentActionType
                        };
                        updatePreview();
                    });
                });
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
            
            function updatePreview() {
                const name = selectedAction ? selectedAction.name : 'Select an action';
                const key = capturedKeys || 'Press keys';
                const action = selectedAction ? selectedAction.name : 'None selected';
                
                document.getElementById('previewName').textContent = name;
                document.getElementById('previewKey').textContent = key;
                document.getElementById('previewAction').textContent = action;
            }
            
            function createShortcut() {
                if (!selectedAction) {
                    alert('Please select an action first');
                    return;
                }
                
                if (!capturedKeys) {
                    alert('Please capture a key combination');
                    document.getElementById('shortcutKey').focus();
                    return;
                }
                
                // Show loading state
                const btn = document.getElementById('createBtn');
                const originalText = btn.innerHTML;
                btn.innerHTML = '⏳ Creating...';
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
                
                // Reset button after delay
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }, 2000);
            }
            
            function cancel() {
                vscode.postMessage({ type: 'cancel' });
            }
        </script>
    </body>
    </html>`;
  }
}
