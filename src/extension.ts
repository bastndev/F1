import * as vscode from 'vscode';
import { activate as activateShortcuts } from './disable-enable/shortcuts/my-list';
import { activate as activateEditorControls } from './disable-enable/editor-controls/editor-controls';
import { activate as activateExtensions } from './disable-enable/extensions/extensions';
import { activate as activateAI } from './disable-enable/shortcuts/default/ai';
import { activate as activateF1 } from './disable-enable/shortcuts/default/f1';

export function activate(context: vscode.ExtensionContext) {
    // Activate each sub-module to register their tree data providers
    activateShortcuts(context);
    activateEditorControls(context);
    activateExtensions(context);
    activateAI(context);
    activateF1(context);
}