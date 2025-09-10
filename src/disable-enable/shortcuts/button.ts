import * as vscode from 'vscode';
import { ShortcutsUIManager } from './ui';

export class F1WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'f1-shortcuts';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    });
  }

  // ==========================================
  // COMMAND HANDLERS
  // ==========================================

  /**
   * Handle git commit command
   */
  private _handleCommit(): void {
    vscode.commands.executeCommand('git.commit');
  }

  /**
   * Handle shortcut command execution
   * @param command - The command name to execute
   */
  private _handleExecute(command: string): void {
    const commandMap = this._getCommandMap();
    const vscodeCommand = commandMap[command];

    if (vscodeCommand) {
      vscode.commands.executeCommand(vscodeCommand);
    } else {
      console.warn(`Unknown command: ${command}`);
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
