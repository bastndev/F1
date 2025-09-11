import * as vscode from 'vscode';
import * as path from 'path';
import { handleExtensionClick } from './ex-notifications';

// Types
interface ExtensionItem {
    name: string;
    iconPath?: string;
}

// Tree Data Provider
class ExtensionTreeProvider implements vscode.TreeDataProvider<ExtensionItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ExtensionItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private extensions: ExtensionItem[] = [];

    constructor() {
        this.refreshExtensions();
    }

    refresh(): void {
        this.refreshExtensions();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ExtensionItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.name);
        item.label = element.name.replace(/\s*\(v[^)]+\)$/, '');
        item.description = element.name.match(/\(v[^)]+\)$/)?.[0] || '';
        item.iconPath = element.iconPath;
        
        // click
        item.command = {
            command: 'f1-extensions.selectExtension',
            title: 'Select Extension',
            arguments: [element]
        };
        
        return item;
    }

    getChildren(): ExtensionItem[] {
        return this.extensions;
    }

    getExtensionCount(): number {
        return this.extensions.length;
    }

    private refreshExtensions(): void {
        this.extensions = vscode.extensions.all
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

// Module-level variables
let treeView: vscode.TreeView<ExtensionItem>;
let treeProvider: ExtensionTreeProvider;

// Helper functions
function updateTreeViewTitle(): void {
    const count = treeProvider.getExtensionCount();
    treeView.title = `Extensions - (${count})`;
}

function setupExtensionChangeListener(): vscode.Disposable {
    return vscode.extensions.onDidChange(() => {
        treeProvider.refresh();
        updateTreeViewTitle();
    });
}

// Command to handle extension selection
function registerSelectExtensionCommand(context: vscode.ExtensionContext): void {
    const selectExtensionCommand = vscode.commands.registerCommand(
        'f1-extensions.selectExtension',
        (extensionItem: ExtensionItem) => {
            handleExtensionClick(extensionItem.name);
        }
    );
    
    context.subscriptions.push(selectExtensionCommand);
}

// Lifecycle functions
export function activate(context: vscode.ExtensionContext): void {
    treeProvider = new ExtensionTreeProvider();
    
    treeView = vscode.window.createTreeView('f1-extensions', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    updateTreeViewTitle();

    // Register command of extension
    registerSelectExtensionCommand(context);

    context.subscriptions.push(
        treeView,
        setupExtensionChangeListener()
    );
}

export function deactivate(): void {}