import * as vscode from 'vscode';
import * as path from 'path';

interface ExtensionItem {
    name: string;
    iconPath?: string;
}

class ExtensionTreeProvider implements vscode.TreeDataProvider<ExtensionItem> {
    getTreeItem(element: ExtensionItem): vscode.TreeItem {
        // ...existing code...
        const item = new vscode.TreeItem(element.name);
        // Change to separate label and description for potential styling
        item.label = element.name.replace(/\s*\(v[^)]+\)$/, ''); // Remove version from label
        item.description = element.name.match(/\(v[^)]+\)$/)?.[0] || ''; // Extract version as description
        item.iconPath = element.iconPath;
        return item;
    }

    getChildren(): ExtensionItem[] {
        return vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin)
            .map(ext => ({
                name: `${ext.packageJSON.displayName || ext.packageJSON.name} (v${ext.packageJSON.version})`,
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