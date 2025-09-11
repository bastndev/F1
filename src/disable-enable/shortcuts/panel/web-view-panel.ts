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
      'f1ComboCreator',
      'F1 Combo Creator',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri]
      }
    );

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

        // Validate that at least one action is selected
        const hasEditorControls = editorControls && editorControls.length > 0;
        const hasExtensionCommands = extensionCommands && extensionCommands.length > 0;
        
        if (!hasEditorControls && !hasExtensionCommands) {
            vscode.window.showErrorMessage('Please select at least one Editor Control or Extension Command');
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

        // Show confirmation with statistics
        const totalActions = (editorControls?.length || 0) + (extensionCommands?.length || 0);
        const isCombo = hasEditorControls && hasExtensionCommands;
        const comboType = isCombo ? 'Combo' : (hasEditorControls ? 'Editor-only' : 'Extension-only');
        
        vscode.window.showInformationMessage(
            `✅ ${comboType} "${label}" created successfully! (${totalActions} actions)`
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
   * Get available editor controls for combo creator
   */
  private _getAvailableEditorControls(): Array<{name: string, key: string}> {
    return [
      { name: 'Minimap', key: 'editor.minimap.enabled' },
      { name: 'Code Folding', key: 'editor.folding' },
      { name: 'Line Numbers', key: 'editor.lineNumbers' },
      { name: 'Cursor Blinking', key: 'editor.cursorBlinking' },
      { name: 'Color Decorators', key: 'editor.colorDecorators' },
      { name: 'Indent Guides', key: 'editor.guides.indentation' },
      { name: 'Sticky Scroll', key: 'editor.stickyScroll.enabled' },
      { name: 'Breadcrumbs', key: 'breadcrumbs.enabled' },
      { name: 'Auto Save', key: 'files.autoSave' },
      { name: 'Format On Save', key: 'editor.formatOnSave' },
      { name: 'Word Wrap', key: 'editor.wordWrap' },
      { name: 'Bracket Pair Colorization', key: 'editor.bracketPairColorization.enabled' }
    ];
  }

  /**
   * Get available extension commands for combo creator
   */
  private _getAvailableExtensionCommands(): Array<{name: string, key: string}> {
    return [
      { name: 'ESLint Fix', key: 'eslint.executeAutofix' },
      { name: 'GitHub Copilot Toggle', key: 'github.copilot.toggleInlineSuggestion' },
      { name: 'Format Document', key: 'editor.action.formatDocument' },
      { name: 'Organize Imports', key: 'editor.action.organizeImports' },
      { name: 'Astro Build', key: 'astro.build' },
      { name: 'Toggle Terminal', key: 'workbench.action.terminal.toggleTerminal' },
      { name: 'Command Palette', key: 'workbench.action.showCommands' },
      { name: 'Quick Open', key: 'workbench.action.quickOpen' },
      { name: 'Toggle Sidebar', key: 'workbench.action.toggleSidebarVisibility' }
    ];
  }

  /**
   * Generate HTML for combo creator
   */
  private _getComboCreatorHTML(): string {
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>F1 Combo Creator</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-foreground);
            }
            .form-group {
                margin-bottom: 15px;
            }
            label {
                display: block;
                margin-bottom: 5px;
                font-weight: 600;
            }
            input, textarea, select {
                width: 100%;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
            }
            .checkbox-group {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 10px;
                margin-top: 10px;
            }
            .checkbox-item {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .buttons {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            }
            .btn-primary {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            .btn-secondary {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            .btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .preview-box {
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 12px;
                margin-top: 8px;
            }
            .preview-item {
                margin-bottom: 6px;
                font-size: 12px;
            }
            .preview-item:last-child {
                margin-bottom: 0;
            }
            .preview-item strong {
                color: var(--vscode-foreground);
                margin-right: 8px;
            }
            .preview-item span {
                color: var(--vscode-descriptionForeground);
            }
        </style>
    </head>
    <body>
        <h2>🎯 Create New Combo</h2>
        
        <div class="form-group">
            <label for="label">Combo Name:</label>
            <input type="text" id="label" placeholder="e.g., Focus Mode" required>
        </div>

        <div class="form-group">
            <label for="key">Shortcut Key:</label>
            <input type="text" id="key" placeholder="e.g., Ctrl+Shift+F" required>
        </div>

        <div class="form-group">
            <label for="description">Description (optional):</label>
            <textarea id="description" placeholder="Brief description of what this combo does"></textarea>
        </div>

        <div class="form-group">
            <label>Editor Controls:</label>
            <div class="checkbox-group" id="editorControls">
                <!-- Will be populated by JavaScript -->
            </div>
        </div>

        <div class="form-group">
            <label>Extension Commands:</label>
            <div class="checkbox-group" id="extensionCommands">
                <!-- Will be populated by JavaScript -->
            </div>
        </div>

        <div class="form-group">
            <label>Preview:</label>
            <div id="preview" class="preview-box">
                <div class="preview-item">
                    <strong>Combo Name:</strong> <span id="preview-label">-</span>
                </div>
                <div class="preview-item">
                    <strong>Shortcut:</strong> <span id="preview-key">-</span>
                </div>
                <div class="preview-item">
                    <strong>Description:</strong> <span id="preview-description">-</span>
                </div>
                <div class="preview-item">
                    <strong>Editor Controls:</strong> <span id="preview-editor">-</span>
                </div>
                <div class="preview-item">
                    <strong>Extension Commands:</strong> <span id="preview-extensions">-</span>
                </div>
                <div class="preview-item">
                    <strong>Total Actions:</strong> <span id="preview-total">-</span>
                </div>
            </div>
        </div>

        <div class="buttons">
            <button class="btn btn-primary" onclick="createCombo()">Create Combo</button>
            <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            // Populate checkboxes with data from extension
            function populateCheckboxes() {
                // Request data from extension
                vscode.postMessage({ type: 'getComboData' });
            }

            // Handle data from extension
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'comboData') {
                    populateGroup('editorControls', message.editorControls);
                    populateGroup('extensionCommands', message.extensionCommands);
                }
            });

            function populateGroup(containerId, items) {
                const container = document.getElementById(containerId);
                items.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'checkbox-item';
                    const itemId = item.name.replace(/\s+/g, '');
                    div.innerHTML = '<input type="checkbox" id="' + itemId + '" value="' + item.key + '" data-name="' + item.name + '">' +
                                   '<label for="' + itemId + '">' + item.name + '</label>';
                    container.appendChild(div);
                });
            }

            function createCombo() {
                const label = document.getElementById('label').value.trim();
                const key = document.getElementById('key').value.trim();
                const description = document.getElementById('description').value.trim();
                
                const editorControls = Array.from(document.querySelectorAll('#editorControls input:checked'))
                    .map(cb => cb.value);
                
                const extensionCommands = Array.from(document.querySelectorAll('#extensionCommands input:checked'))
                    .map(cb => cb.value);

                // Validation
                if (!label) {
                    alert('Please enter a combo name');
                    document.getElementById('label').focus();
                    return;
                }

                if (!key) {
                    alert('Please enter a shortcut key');
                    document.getElementById('key').focus();
                    return;
                }

                if (editorControls.length === 0 && extensionCommands.length === 0) {
                    alert('Please select at least one Editor Control or Extension Command');
                    return;
                }

                // Show loading state
                const createBtn = document.querySelector('.btn-primary');
                const originalText = createBtn.textContent;
                createBtn.textContent = 'Creating...';
                createBtn.disabled = true;

                // Send message to extension
                vscode.postMessage({
                    type: 'createCombo',
                    value: { label, key, description, editorControls, extensionCommands }
                });

                // Reset button after a delay (in case of error)
                setTimeout(() => {
                    createBtn.textContent = originalText;
                    createBtn.disabled = false;
                }, 3000);
            }

            function cancel() {
                vscode.postMessage({ type: 'cancel' });
            }

            // Setup real-time preview
            function setupPreview() {
                // Add event listeners for real-time preview
                document.getElementById('label').addEventListener('input', updatePreview);
                document.getElementById('key').addEventListener('input', updatePreview);
                document.getElementById('description').addEventListener('input', updatePreview);
                
                // Add event listeners for checkboxes
                document.querySelectorAll('#editorControls input, #extensionCommands input').forEach(checkbox => {
                    checkbox.addEventListener('change', updatePreview);
                });
                
                // Initial preview update
                updatePreview();
            }

            function updatePreview() {
                const label = document.getElementById('label').value.trim() || '-';
                const key = document.getElementById('key').value.trim() || '-';
                const description = document.getElementById('description').value.trim() || '-';
                
                const editorControls = Array.from(document.querySelectorAll('#editorControls input:checked'))
                    .map(cb => cb.getAttribute('data-name'));
                
                const extensionCommands = Array.from(document.querySelectorAll('#extensionCommands input:checked'))
                    .map(cb => cb.getAttribute('data-name'));

                const totalActions = editorControls.length + extensionCommands.length;

                // Update preview elements
                document.getElementById('preview-label').textContent = label;
                document.getElementById('preview-key').textContent = key;
                document.getElementById('preview-description').textContent = description;
                document.getElementById('preview-editor').textContent = editorControls.length > 0 ? editorControls.join(', ') : 'None';
                document.getElementById('preview-extensions').textContent = extensionCommands.length > 0 ? extensionCommands.join(', ') : 'None';
                document.getElementById('preview-total').textContent = totalActions.toString();
            }

            // Initialize
            populateCheckboxes();
            setupPreview();
        </script>
    </body>
    </html>`;
  }
}
