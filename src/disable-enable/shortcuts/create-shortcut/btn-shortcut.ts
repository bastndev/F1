import * as vscode from 'vscode';
import { ShortcutsUIManager } from '../ui';
import { MyListUI, ShortcutItem } from '../my-list';
import { ComboCreatorPanel } from './new-file-shortcut';

export class F1WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'f1-shortcuts';
  private _view?: vscode.WebviewView;
  private _comboCreatorPanel: ComboCreatorPanel;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._comboCreatorPanel = new ComboCreatorPanel(_extensionUri);
    this._comboCreatorPanel.setOnComboCreated(() => this.refresh());
  }

  // ==========================================
  // WEBVIEW LIFECYCLE METHODS
  // ==========================================

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Generate HTML using UI manager
    webviewView.webview.html = ShortcutsUIManager.generateWebviewHTML();

    // Setup message handling
    this._setupMessageHandling(webviewView);
  }

  // ==========================================
  // MESSAGE HANDLING
  // ==========================================

  /**
   * Setup message handling between webview and extension
   */
  private _setupMessageHandling(webviewView: vscode.WebviewView): void {
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case 'commit':
          this._handleCommit();
          break;
        case 'execute':
          this._handleExecute(data.value);
          break;
        case 'confirmDelete':
          this._handleConfirmDelete(data.value);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    });
  }

  // ==========================================
  // COMMAND HANDLERS
  // ==========================================

  /**
   * Handle combo creation command
   */
  private _handleCommit(): void {
    this._comboCreatorPanel.showComboCreator();
  }


  /**
   * Handle shortcut command execution
   * @param command - The command name to execute
   */
  private async _handleExecute(command: string): Promise<void> {
    // Check if it's a combo shortcut ID
    const shortcut = MyListUI.getShortcutById(command);
    if (shortcut) {
      await this._executeComboShortcut(shortcut);
      return;
    }

    // Handle regular commands
    const commandMap = this._getCommandMap();
    const vscodeCommand = commandMap[command];

    if (vscodeCommand) {
      vscode.commands.executeCommand(vscodeCommand);
    } else {
      console.warn(`Unknown command: ${command}`);
    }
  }

  /**
   * Execute a combo shortcut
   * @param shortcut - The shortcut to execute
   */
  private async _executeComboShortcut(shortcut: ShortcutItem): Promise<void> {
    try {
      // Mark as used
      MyListUI.markAsUsed(shortcut.id!);

      // Execute editor controls
      if (shortcut.actions.editorControls?.length) {
        for (const configKey of shortcut.actions.editorControls) {
          await this._toggleEditorControl(configKey);
        }
      }

      // Execute extension commands
      if (shortcut.actions.extensionCommands?.length) {
        for (const command of shortcut.actions.extensionCommands) {
          try {
            await vscode.commands.executeCommand(command);
          } catch (error) {
            console.warn(`Failed to execute command ${command}:`, error);
          }
        }
      }

      // Handle installed extensions (for future extension management)
      if (shortcut.actions.installedExtensions?.length) {
        for (const extensionId of shortcut.actions.installedExtensions) {
          try {
            // For now, just show extension info
            const extension = vscode.extensions.getExtension(extensionId);
            if (extension) {
              vscode.window.showInformationMessage(
                `Extension: ${extension.packageJSON.displayName || extension.packageJSON.name} - ${extension.isActive ? 'Active' : 'Inactive'}`
              );
            }
          } catch (error) {
            console.warn(`Failed to process extension ${extensionId}:`, error);
          }
        }
      }

      // Show success message
      const totalActions = (shortcut.actions.editorControls?.length || 0) + 
                          (shortcut.actions.extensionCommands?.length || 0) +
                          (shortcut.actions.installedExtensions?.length || 0);
      vscode.window.showInformationMessage(
        `✅ Executed "${shortcut.label}" (${totalActions} actions)`
      );

    } catch (error) {
      console.error('Error executing combo shortcut:', error);
      vscode.window.showErrorMessage(`Error executing combo: ${error}`);
    }
  }

  /**
   * Toggle an editor control configuration
   * @param configKey - The configuration key to toggle
   */
  private async _toggleEditorControl(configKey: string): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration();
      const currentValue = config.get(configKey);

      // Handle different types of configuration values
      let newValue: any;

      if (typeof currentValue === 'boolean') {
        newValue = !currentValue;
      } else if (configKey === 'editor.lineNumbers') {
        newValue = currentValue === 'on' ? 'off' : 'on';
      } else if (configKey === 'files.autoSave') {
        newValue = currentValue === 'off' ? 'afterDelay' : 'off';
      } else if (configKey === 'editor.cursorBlinking') {
        newValue = currentValue === 'blink' ? 'solid' : 'blink';
      } else if (configKey === 'editor.acceptSuggestionOnEnter') {
        newValue = currentValue === 'on' ? 'off' : 'on';
      } else {
        newValue = !currentValue;
      }

      await config.update(
        configKey,
        newValue,
        vscode.ConfigurationTarget.Global
      );
    } catch (error) {
      console.warn(`Failed to toggle ${configKey}:`, error);
    }
  }

  /**
   * Handle delete confirmation for shortcuts
   * @param data - Object containing index and label of the shortcut to delete
   */
  private async _handleConfirmDelete(data: {
    index: number;
    label: string;
  }): Promise<void> {
    const { index, label } = data;

    // Show VSCode native confirmation dialog
    const result = await vscode.window.showInformationMessage(
      `Are you sure to 𝗱𝗲𝗹𝗲𝘁𝗲 "${label}" ?`,
      { modal: true },
      'Yes',
    );

    // If user clicked "Yes", remove the shortcut and refresh the webview
    if (result === 'Yes') {
      MyListUI.removeShortcut(index);

      // Refresh the webview to show updated list
      this.refresh();
    }
  }

  /**
   * Get mapping of shortcut commands to VSCode commands
   * This makes it easy to add new commands or modify existing ones
   */
  private _getCommandMap(): Record<string, string> {
    return {
      // Terminal & Navigation
      'Toggle Terminal': 'workbench.action.terminal.toggleTerminal',
      'Command Palette': 'workbench.action.showCommands',
      'Quick Open': 'workbench.action.quickOpen',
      'Toggle Sidebar': 'workbench.action.toggleSidebarVisibility',

      // Editor Actions
      'Toggle Word Wrap': 'editor.action.toggleWordWrap',

      // AI & Extensions
      'Toggle AI': 'workbench.action.toggleAuxiliaryBar',

      // Add more commands here as needed...
    };
  }

  // ==========================================
  // PUBLIC API (if needed for external access)
  // ==========================================

  /**
   * Get the current webview instance
   */
  public getWebview(): vscode.WebviewView | undefined {
    return this._view;
  }

  /**
   * Refresh the webview content
   */
  public refresh(): void {
    if (this._view) {
      this._view.webview.html = ShortcutsUIManager.generateWebviewHTML();
    }
  }
}

/**
 * ========================================
 * USAGE NOTES:
 * ========================================
 *
 * 1. To add new commands:
 *    - Add to _getCommandMap()
 *    - Update MyListUI in my-list.ts with the new shortcut
 *
 * 2. To modify UI:
 *    - Edit ShortcutsUIManager in ui-ux.ts
 *    - This class focuses only on business logic
 *
 * 3. To add new message types:
 *    - Add case in _setupMessageHandling()
 *    - Create corresponding handler method
 */