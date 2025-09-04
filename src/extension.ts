import * as vscode from 'vscode';

class F1TreeProvider implements vscode.TreeDataProvider<string> {
    getTreeItem(element: string): vscode.TreeItem {
        return new vscode.TreeItem(element);
    }
    
    getChildren(): string[] {
        return ['Hello Wold 🧪'];
    }
}

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerTreeDataProvider('f1-shortcuts', new F1TreeProvider());
}

export function deactivate() {}