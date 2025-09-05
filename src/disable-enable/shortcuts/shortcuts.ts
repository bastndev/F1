import * as vscode from 'vscode';

// Provider para el webview con botones
class F1WebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'f1-shortcuts';

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Escuchar mensajes desde el webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'commit':
                    this.handleCommit();
                    break;
                case 'execute':
                    this.handleExecute(data.value);
                    break;
            }
        });
    }

    private handleCommit() {
        // Ejecutar commit sin mostrar notificación
        vscode.commands.executeCommand('git.commit');
    }

    private handleExecute(command: string) {
        // Ejecutar comando sin mostrar notificación
        switch (command) {
            case 'Toggle Terminal':
                vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
                break;
            case 'Command Palette':
                vscode.commands.executeCommand('workbench.action.showCommands');
                break;
            case 'Quick Open':
                vscode.commands.executeCommand('workbench.action.quickOpen');
                break;
            case 'Toggle Sidebar':
                vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
                break;
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>F1 Shortcuts</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                }

                .button {
                    background-color: #007acc;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    margin-bottom: 15px;
                }

                .button:hover {
                    background-color: #005a9e;
                }

                .section-title {
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: var(--vscode-foreground);
                    font-size: 12px;
                    text-transform: uppercase;
                }

                .shortcut-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 8px;
                    border-radius: 3px;
                    margin-bottom: 4px;
                    background-color: var(--vscode-list-hoverBackground);
                    cursor: pointer;
                }

                .shortcut-item:hover {
                    background-color: var(--vscode-list-activeSelectionBackground);
                }

                .shortcut-key {
                    font-family: monospace;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 11px;
                }
            </style>
        </head>
        <body>
            <button class="button" onclick="sendMessage('commit')">
                <span>✓</span>
                Commit Changes
            </button>

            <div class="section-title">Shortcuts</div>
            <div class="shortcut-item" onclick="executeCommand('Toggle Terminal')">
                <span>Toggle Terminal</span>
                <span class="shortcut-key">Ctrl+\`</span>
            </div>
            
            <div class="shortcut-item" onclick="executeCommand('Command Palette')">
                <span>Command Palette</span>
                <span class="shortcut-key">Ctrl+Shift+P</span>
            </div>
            
            <div class="shortcut-item" onclick="executeCommand('Quick Open')">
                <span>Quick Open</span>
                <span class="shortcut-key">Ctrl+P</span>
            </div>
            
            <div class="shortcut-item" onclick="executeCommand('Toggle Sidebar')">
                <span>Toggle Sidebar</span>
                <span class="shortcut-key">Ctrl+B</span>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function sendMessage(type, value = null) {
                    vscode.postMessage({ type, value });
                }

                function executeCommand(command) {
                    sendMessage('execute', command);
                }
            </script>
        </body>
        </html>`;
    }
}

// Tree provider simplificado
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

    // Comando para items clickeados
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