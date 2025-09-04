import * as vscode from 'vscode';

class F1TreeProvider implements vscode.TreeDataProvider<string> {
    getTreeItem(element: string): vscode.TreeItem {
        return new vscode.TreeItem(element);
    }
    
    getChildren(): string[] {
        return ['Hello Wold - EDITOR CONTROLS 🧪'];
    }
}

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerTreeDataProvider('f1-editor-controls', new F1TreeProvider());
}

export function deactivate() {}