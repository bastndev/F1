import * as vscode from 'vscode';
import { registerKeymapCommands } from './keymaps/default';
import { FunctionKeyStatusProvider } from './keymaps/statusProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "F1" is now active!');

  // Register all keymap commands
  registerKeymapCommands(context);

  // Create and register the function key status provider
  const functionKeyStatusProvider = new FunctionKeyStatusProvider();
  vscode.window.registerTreeDataProvider('f1-toggles', functionKeyStatusProvider);

  // Register refresh command for the tree view
  const refreshCommand = vscode.commands.registerCommand('f1.refreshStatus', () => {
    functionKeyStatusProvider.refresh();
  });

  context.subscriptions.push(refreshCommand);
}

export function deactivate() {}
