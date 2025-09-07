import * as vscode from 'vscode';
import { activate as activateShortcuts } from './disable-enable/shortcuts/my-list';
import { activate as activateEditorControls } from './disable-enable/editor-controls/editor-controls';
import { activate as activateExtensions } from './disable-enable/extensions/extensions';
import { activate as activateKeymaps } from './disable-enable/shortcuts/default-keymaps';

export function activate(context: vscode.ExtensionContext) {
    // Activate each sub-module to register their tree data providers
    activateShortcuts(context);
    activateEditorControls(context);
    activateExtensions(context);
    activateKeymaps(context);
}