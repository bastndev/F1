import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getCliHubWebviewHtml } from './webview/index';

const allowedAgents = new Set([
	'OpenCode',
	'Claude Code',
	'Codex CLI',
	'Gemini CLI',
	'Aider',
	'GitHub Copilot CLI',
	'Cline',
	'Kiro CLI',
	'Goose',
	'Amp',
	'Continue CLI',
	'Kilo Code',
	'Tabnine CLI',
	'Pi'
]);

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
			if (message.type !== 'openAgent' || !message.agent || !allowedAgents.has(message.agent)) {
				return;
			}

			webviewView.webview.html = this._getAgentHtmlForWebview(webviewView.webview, message.agent);
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'index.html');
		const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'global.css');

		const styleUri = webview.asWebviewUri(stylePath);
		const nonce = this._getNonce();
		const contentSecurityPolicy = [
			"default-src 'none'",
			`style-src ${webview.cspSource}`,
			`script-src 'nonce-${nonce}'`
		].join('; ');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		html = html.replace('${styleUri}', styleUri.toString());
		html = html.replace('${contentSecurityPolicy}', contentSecurityPolicy);
		html = html.replace('${nonce}', nonce);

		html = html.replace('${workspacePath}', this._getWorkspacePath());

		return html;
	}

	private _getAgentHtmlForWebview(webview: vscode.Webview, selectedAgent: string) {
		const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'global.css');

		return getCliHubWebviewHtml({
			extensionUri: this._extensionUri,
			cspSource: webview.cspSource,
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

	private _getNonce() {
		return crypto.randomBytes(16).toString('base64');
	}
}
