import * as vscode from 'vscode';

class F1TreeProvider implements vscode.TreeDataProvider<string> {
    getTreeItem(element: string): vscode.TreeItem {
        return new vscode.TreeItem(element);
    }
    
    getChildren(): string[] {
        return ['Hello Wold - EXTENSION 🧪'];
    }
}

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerTreeDataProvider('f1-extensions', new F1TreeProvider());
}

export function deactivate() {}