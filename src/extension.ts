import * as vscode from 'vscode';

class F1TreeDataProvider implements vscode.TreeDataProvider<string> {
    getTreeItem(element: string): vscode.TreeItem {
        const item = new vscode.TreeItem(element);
        item.tooltip = `Hello World item: ${element}`;
        return item;
    }

    getChildren(element?: string): string[] {
        if (!element) {
            return ['Hello World', 'F1 Extension', 'Working!'];
        }
        return [];
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Registrar TreeDataProvider
    const treeDataProvider = new F1TreeDataProvider();
    vscode.window.registerTreeDataProvider('f1-explorer', treeDataProvider);

    // Command to open panel
    let openPanelCommand = vscode.commands.registerCommand('f1.openPanel', () => {
        vscode.window.showInformationMessage('Hello World from F1 Extension!');
    });

    // Command to toggle panel
    let togglePanelCommand = vscode.commands.registerCommand('f1.togglePanel', () => {
        vscode.window.showInformationMessage('Hello World - Toggle F1 Panel!');
    });

    context.subscriptions.push(openPanelCommand);
    context.subscriptions.push(togglePanelCommand);
}

export function deactivate() {}