import * as vscode from 'vscode';
import { activate as activateShortcuts } from './disable-enable/shortcuts/my-list';
import { activate as activateEditorControls } from './disable-enable/editor-controls/editor-controls';
import { activate as activateExtensions } from './disable-enable/extensions/extensions';
import { activate as activateAI } from './disable-enable/shortcuts/default/ai';
import { activate as activateF1 } from './disable-enable/shortcuts/default/f1';
import { activate as activateCursor } from './disable-enable/shortcuts/default/cursor'; // Nueva importación

export function activate(context: vscode.ExtensionContext) {
    // Activate data providers
    activateShortcuts(context);
    activateEditorControls(context);
    activateExtensions(context);
    activateAI(context);
    activateF1(context);
    activateCursor(context); // Activar el módulo de cursor
}