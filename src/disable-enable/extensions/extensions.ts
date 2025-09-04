import * as vscode from 'vscode';
import * as path from 'path';

interface ExtensionItem {
    name: string;
    iconPath?: string;
}

class ExtensionTreeProvider implements vscode.TreeDataProvider<ExtensionItem> {
    getTreeItem(element: ExtensionItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.name);
        item.iconPath = element.iconPath;
        return item;
    }

    getChildren(): ExtensionItem[] {
        return vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin)
            .map(ext => ({
                name: ext.packageJSON.displayName || ext.packageJSON.name,
                iconPath: ext.packageJSON.icon 
                    ? path.join(ext.extensionPath, ext.packageJSON.icon) 
                    : undefined
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerTreeDataProvider('f1-extensions', new ExtensionTreeProvider());
}

export function deactivate() {}