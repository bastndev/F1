import * as vscode from 'vscode';
import { F1WebviewProvider } from './disable-enable/shortcuts/ui';
import { activate as activateEditorControls } from './disable-enable/editor-controls/editor-controls';
import { activate as activateExtensions } from './disable-enable/extensions/extensions';
import { activate as activateAI } from './disable-enable/shortcuts/default/ai';
import { activate as activateF1 } from './disable-enable/shortcuts/default/f1';

export function activate(context: vscode.ExtensionContext) {
  // Register the webview provider for shortcuts
  const webviewProvider = new F1WebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      F1WebviewProvider.viewType,
      webviewProvider
    )
  );

  // Activate other data providers
  activateEditorControls(context);
  activateExtensions(context);
  activateAI(context);
  activateF1(context);
}
