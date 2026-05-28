import * as vscode from 'vscode';
import * as fs from 'fs';

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
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'index.html');
		const stylePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'clihub', 'global.css');

		const styleUri = webview.asWebviewUri(stylePath);

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		html = html.replace('${styleUri}', styleUri.toString());

		// Inject workspace path
		let workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '~/workspace/project';
		
		const homedir = require('os').homedir();
		if (workspacePath.startsWith(homedir)) {
			workspacePath = '~' + workspacePath.slice(homedir.length);
		}

		html = html.replace('${workspacePath}', workspacePath);

		return html;
	}
}