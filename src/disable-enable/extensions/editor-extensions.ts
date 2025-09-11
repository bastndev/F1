import * as vscode from 'vscode';
import * as path from 'path';

// Types
interface ExtensionItem {
    name: string;
    iconPath?: string;
    extensionId: string;
    repositoryUrl?: string;
}

// Tree data provider
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
        
        const { displayName, version } = this.parseExtensionName(element.name);
        
        item.label = displayName;
        item.description = version;
        item.iconPath = element.iconPath;
        item.tooltip = `Click to open GitHub repository for ${displayName}`;
                
        // Command to open GitHub directly
        item.command = {
            command: 'f1-extensions.openGitHub',
            title: 'Open GitHub Repository',
            arguments: [element]
        };
                
        return item;
    }

    private parseExtensionName(fullName: string): { displayName: string; version: string } {
        const versionMatch = fullName.match(/\s*\((v?[\d]+\.[\d]+\.[\d]+(?:-[\w\d\.-]*)?)\)$/i);
        
        if (versionMatch) {
            const version = versionMatch[1];
            const displayName = fullName.substring(0, versionMatch.index).trim();
            
            const formattedVersion = version.startsWith('v') ? version : `v${version}`;
            
            return {
                displayName,
                version: `(${formattedVersion})`
            };
        }
        
        return {
            displayName: fullName,
            version: ''
        };
    }

    getChildren(): ExtensionItem[] {
        return this.extensions;
    }

    getExtensionCount(): number {
        return this.extensions.length;
    }

    private getRepositoryUrl(packageJSON: any): string | undefined {
        // Try to get repository URL from different fields
        if (packageJSON.repository) {
            if (typeof packageJSON.repository === 'string') {
                return this.normalizeGitHubUrl(packageJSON.repository);
            } else if (packageJSON.repository.url) {
                return this.normalizeGitHubUrl(packageJSON.repository.url);
            }
        }
        
        // Try from homepage
        if (packageJSON.homepage && packageJSON.homepage.includes('github.com')) {
            return this.normalizeGitHubUrl(packageJSON.homepage);
        }
        
        // Try from bugs.url
        if (packageJSON.bugs && packageJSON.bugs.url && packageJSON.bugs.url.includes('github.com')) {
            return this.normalizeGitHubUrl(packageJSON.bugs.url);
        }
        
        return undefined;
    }

    private normalizeGitHubUrl(url: string): string {
        // Clean and normalize GitHub URLs
        let cleanUrl = url.replace(/^git\+/, '').replace(/\.git$/, '');
        
        // Convert SSH to HTTPS
        if (cleanUrl.startsWith('git@github.com:')) {
            cleanUrl = cleanUrl.replace('git@github.com:', 'https://github.com/');
        }
        
        // Ensure it's HTTPS
        if (cleanUrl.startsWith('http://github.com')) {
            cleanUrl = cleanUrl.replace('http://', 'https://');
        }
        
        // Remove unnecessary fragments and queries for issues/bugs
        if (cleanUrl.includes('/issues') || cleanUrl.includes('/bugs')) {
            cleanUrl = cleanUrl.split('/issues')[0].split('/bugs')[0];
        }
        
        return cleanUrl;
    }

    private refreshExtensions(): void {
        this.extensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin)
            .map(ext => ({
                name: `${ext.packageJSON.displayName || ext.packageJSON.name} (v${ext.packageJSON.version})`,
                iconPath: ext.packageJSON.icon 
                    ? path.join(ext.extensionPath, ext.packageJSON.icon)
                    : undefined,
                extensionId: ext.id,
                repositoryUrl: this.getRepositoryUrl(ext.packageJSON)
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

// Function to open GitHub directly
async function openExtensionGitHub(extensionItem: ExtensionItem): Promise<void> {
    try {
        let githubUrl = extensionItem.repositoryUrl;
        
        // If we don't have the repository URL, try to search it in the marketplace
        if (!githubUrl) {
            const marketplaceUrl = `https://marketplace.visualstudio.com/items?itemName=${extensionItem.extensionId}`;
            githubUrl = marketplaceUrl;
        }
        
        if (githubUrl) {
            await vscode.env.openExternal(vscode.Uri.parse(githubUrl));
        } else {
            // Fallback: search on GitHub by extension name
            const searchQuery = encodeURIComponent(extensionItem.name.split('(')[0].trim());
            const searchUrl = `https://github.com/search?q=${searchQuery}&type=repositories`;
            await vscode.env.openExternal(vscode.Uri.parse(searchUrl));
        }
    } catch (error) {
        // Silent error handling
        console.error(`Error opening GitHub repository: ${error}`);
    }
}

// Command to open GitHub
function registerOpenGitHubCommand(context: vscode.ExtensionContext): void {
    const openGitHubCommand = vscode.commands.registerCommand(
        'f1-extensions.openGitHub',
        (extensionItem: ExtensionItem) => {
            openExtensionGitHub(extensionItem);
        }
    );
        
    context.subscriptions.push(openGitHubCommand);
}

// Additional command to refresh the list
function registerRefreshCommand(context: vscode.ExtensionContext): void {
    const refreshCommand = vscode.commands.registerCommand(
        'f1-extensions.refresh',
        () => {
            treeProvider.refresh();
            updateTreeViewTitle();
        }
    );
    
    context.subscriptions.push(refreshCommand);
}

// Lifecycle functions
export function activate(context: vscode.ExtensionContext): void {
    treeProvider = new ExtensionTreeProvider();
        
    treeView = vscode.window.createTreeView('f1-extensions', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    
    updateTreeViewTitle();
    
    // Register commands
    registerOpenGitHubCommand(context);
    registerRefreshCommand(context);
    
    context.subscriptions.push(
        treeView,
        setupExtensionChangeListener()
    );
}

export function deactivate(): void {
    // Cleanup if necessary
}