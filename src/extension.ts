import * as vscode from 'vscode';
import { registerKeymapCommands } from './keymaps/default';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "F1" is now active!');

  // Register all keymap commands
  registerKeymapCommands(context);
}

export function deactivate() {}
