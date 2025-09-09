import * as vscode from 'vscode';

export class F1WebviewProvider implements vscode.WebviewViewProvider {
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
        // Listen for messages from the webview
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
        // Execute commit without showing notification
        vscode.commands.executeCommand('git.commit');
    }

    private handleExecute(command: string) {
        // Execute command without showing notification
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
                height: 100vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                width: 100%;
                margin-bottom: 15px;
                flex-shrink: 0;
            }

            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }

            .section-title {
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--vscode-foreground);
                font-size: 12px;
                text-transform: uppercase;
                flex-shrink: 0;
            }

            .shortcuts-container {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
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
            .user-line {
                border-top: 0.5px solid #d1d1d11b;
                width: 100%;
                margin: 10px 0;
            }
            </style>
        </head>
        <body>
            <button class="button" onclick="sendMessage('commit')">
            Combine
            </button>

            <div class="section-title">My List</div>
            
            <div class="shortcuts-container">
                <div class="shortcut-item" onclick="executeCommand('Toggle Terminal')">
                <span>Toggle word Wrap</span>
                <span class="shortcut-key">F1</span>
                </div>

                <div class="shortcut-item" onclick="executeCommand('Toggle Terminal')">
                <span>Toggle AI suggestions</span>
                <span class="shortcut-key">Shift+F1</span>
                </div>

                <div class="user-line"></div>
                
                <div class="shortcut-item" onclick="executeCommand('Toggle Terminal')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+\`</span>
                </div>
                
                <div class="shortcut-item" onclick="executeCommand('Command Palette')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+Shift+P</span>
                </div>
                
                <div class="shortcut-item" onclick="executeCommand('Quick Open')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+P</span>
                </div>

                <div class="shortcut-item" onclick="executeCommand('Toggle Sidebar')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+B</span>
                </div>

                <div class="shortcut-item" onclick="executeCommand('Toggle Sidebar')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+B</span>
                </div>

                <div class="shortcut-item" onclick="executeCommand('Toggle Sidebar')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+B</span>
                </div>

                <div class="shortcut-item" onclick="executeCommand('Toggle Sidebar')">
                <span>Test 🧪</span>
                <span class="shortcut-key">Ctrl+B</span>
                </div>
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