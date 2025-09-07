import * as vscode from 'vscode';
import { F1WebviewProvider } from './button';

class F1TreeProvider implements vscode.TreeDataProvider<string> {
    constructor(private items: string[]) {}

    getTreeItem(element: string): vscode.TreeItem {
        const item = new vscode.TreeItem(element);
        item.command = {
            command: 'f1.itemClicked',
            title: 'Click Item',
            arguments: [element]
        };
        return item;
    }

    getChildren(): string[] {
        return this.items;
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Registrar el webview provider
    const webviewProvider = new F1WebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(F1WebviewProvider.viewType, webviewProvider)
    );

    // Tree providers
    const editorControlsProvider = new F1TreeProvider([
        'Format Document',
        'Toggle Word Wrap',
        'Toggle Minimap',
        'Split Editor'
    ]);

    const extensionsProvider = new F1TreeProvider([
        'Install Extension',
        'Disable Extension',
        'Extension Settings',
        'Reload Window'
    ]);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('f1-editor-controls', editorControlsProvider),
        vscode.window.registerTreeDataProvider('f1-extensions', extensionsProvider)
    );

    // Command for clicked items
    const itemClickedCommand = vscode.commands.registerCommand('f1.itemClicked', (item: string) => {
        switch (item) {
            case 'Format Document':
                vscode.commands.executeCommand('editor.action.formatDocument');
                break;
            case 'Toggle Word Wrap':
                vscode.commands.executeCommand('editor.action.toggleWordWrap');
                break;
            case 'Toggle Minimap':
                vscode.commands.executeCommand('editor.action.toggleMinimap');
                break;
            case 'Split Editor':
                vscode.commands.executeCommand('workbench.action.splitEditor');
                break;
            case 'Install Extension':
                vscode.commands.executeCommand('workbench.view.extensions');
                break;
            case 'Reload Window':
                vscode.commands.executeCommand('workbench.action.reloadWindow');
                break;
        }
    });

    context.subscriptions.push(itemClickedCommand);
}

export function deactivate() {}