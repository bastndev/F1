import * as vscode from 'vscode';
import { ShortcutsUIManager } from '../ui';
import { MyListUI, ShortcutItem } from '../my-list/user-shortcuts';
import { DynamicShortcutManager } from '../my-list/dynamic-shortcuts';
import { ComboCreatorPanel } from './new-file-shortcut';
import { ConfigManager } from '../../../core/config-manager';

export class F1WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'f1-shortcuts';
  private _view?: vscode.WebviewView;
  private _comboCreatorPanel: ComboCreatorPanel;
  private _context: vscode.ExtensionContext;

  constructor(private readonly _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this._context = context;
    this._comboCreatorPanel = new ComboCreatorPanel(_extensionUri, context);
    this._comboCreatorPanel.setOnComboCreated(() => this.refresh());
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = ShortcutsUIManager.generateWebviewHTML();
    this._setupMessageHandling(webviewView);
  }

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

  private _handleCommit(): void {
    this._comboCreatorPanel.showComboCreator();
  }

  private async _handleExecute(command: string): Promise<void> {
    const shortcut = MyListUI.getShortcutById(command);
    if (shortcut) {
      // Use DynamicShortcutManager to execute the shortcut
      const dynamicManager = DynamicShortcutManager.getInstance(this._context);
      // For now, we'll execute it directly here since DynamicShortcutManager handles registered shortcuts
      await this._executeComboShortcut(shortcut);
      return;
    }

    const commandMap = this._getCommandMap();
    const vscodeCommand = commandMap[command];

    if (vscodeCommand) {
      vscode.commands.executeCommand(vscodeCommand);
    } else {
      console.warn(`Unknown command: ${command}`);
    }
  }

  private async _executeComboShortcut(shortcut: ShortcutItem): Promise<void> {
    try {
      MyListUI.markAsUsed(shortcut.id!);

      if (shortcut.actions.editorControls?.length) {
        for (const configKey of shortcut.actions.editorControls) {
          await this._toggleEditorControl(configKey);
        }
      }

      if (shortcut.actions.extensionCommands?.length) {
        for (const command of shortcut.actions.extensionCommands) {
          try {
            await vscode.commands.executeCommand(command);
          } catch (error) {
            console.warn(`Failed to execute command ${command}:`, error);
          }
        }
      }

      if (shortcut.actions.installedExtensions?.length) {
        for (const extensionId of shortcut.actions.installedExtensions) {
          try {
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
  }  private async _toggleEditorControl(configKey: string): Promise<void> {
    await ConfigManager.toggleConfiguration(configKey);
  }

  /**
   * Handle delete confirmation for shortcuts
   */
  private async _handleConfirmDelete(data: {
    index: number;
    label: string;
  }): Promise<void> {
    const { index, label } = data;
    await MyListUI.confirmAndDeleteShortcut(index, label);
    this.refresh();
  }

  private _getCommandMap(): Record<string, string> {
    return {
      'Toggle Terminal': 'workbench.action.terminal.toggleTerminal',
      'Command Palette': 'workbench.action.showCommands',
      'Quick Open': 'workbench.action.quickOpen',
      'Toggle Sidebar': 'workbench.action.toggleSidebarVisibility',
      'Toggle Word Wrap': 'editor.action.toggleWordWrap',
      'Toggle AI': 'workbench.action.toggleAuxiliaryBar',
    };
  }

  public getWebview(): vscode.WebviewView | undefined {
    return this._view;
  }

  public refresh(): void {
    if (this._view) {
      this._view.webview.html = ShortcutsUIManager.generateWebviewHTML();
    }
  }
}