import * as vscode from 'vscode';
import * as fs from 'fs';
import { getCliHubWebviewHtml } from './webview/index';

export class CliHubViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'f1.cliHub';

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
		webviewView.webview.onDidReceiveMessage((message: { type?: string; agent?: string }) => {
			if (message.type !== 'openAgent' || !message.agent) {
				return;
			}

			webviewView.webview.html = this._getAgentHtmlForWebview(webviewView.webview, message.agent);
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'index.html');
		const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'global.css');

		const styleUri = webview.asWebviewUri(stylePath);

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		html = html.replace('${styleUri}', styleUri.toString());

		html = html.replace('${workspacePath}', this._getWorkspacePath());

		return html;
	}

	private _getAgentHtmlForWebview(webview: vscode.Webview, selectedAgent: string) {
		const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'global.css');

		return getCliHubWebviewHtml({
			styleUri: webview.asWebviewUri(stylePath).toString(),
			selectedAgent,
			workspacePath: this._getWorkspacePath()
		});
	}

	private _getWorkspacePath() {
		const fullPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '~/workspace/project';
		const projectName = require('path').basename(fullPath);

		return `~/${projectName}`;
	}
}
