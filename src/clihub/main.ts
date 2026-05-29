import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { allowedAgents, cliAgents, getCliAgent } from './webview/core/terminal-cli/agents';
import { ensureCliInstalled, isCliInstalled } from './webview/core/terminal-cli/installation';
import { CliSessionManager } from './webview/core/terminal-cli/session-manager';
import { getCliHubWebviewHtml } from './webview/index';

type CliHubMessage = {
	type?: string;
	agent?: string;
};

type LauncherAgent = {
	label: string;
	aliases: string[];
	iconFile: string;
	darkIcon?: boolean;
};

const launcherAgents: LauncherAgent[] = [
	{ label: 'OpenCode', aliases: ['opencode', 'open code', 'op'], iconFile: 'opencode.svg' },
	{ label: 'Codex CLI', aliases: ['codex', 'codex cli', 'code', 'co', 'c'], iconFile: 'codex.svg' },
	{ label: 'Claude Code', aliases: ['claude', 'claude code'], iconFile: 'claudecode.svg' },
	{ label: 'Antigravity CLI', aliases: ['antigravity', 'antigravity cli', 'agy', 'an', 'ant'], iconFile: 'Antigravity_cli.svg' },
	{ label: 'GitHub Copilot CLI', aliases: ['github copilot', 'copilot', 'copilot cli'], iconFile: 'github-copilot.svg', darkIcon: true },
	{ label: 'Codeep', aliases: ['codeep', 'deep'], iconFile: 'Codeep.svg' },
	{ label: 'Amp', aliases: ['amp'], iconFile: 'amp.svg' },
	{ label: 'Kiro CLI', aliases: ['kiro', 'kiro cli'], iconFile: 'kiro.svg' },
	{ label: 'Kilo Code', aliases: ['kilo', 'kilo code', 'code', 'k'], iconFile: 'kilocode.svg', darkIcon: true },
	{ label: 'Grok', aliases: ['grok'], iconFile: 'grok.svg', darkIcon: true }
];

export class CliHubViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'f1.cliHub';
	private readonly sessionManager = new CliSessionManager();
	private pendingInitialAgent?: string;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._getCliHubAssetUri()]
		};

		webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
		webviewView.onDidDispose(() => {
			this.sessionManager.detach();
		});
		webviewView.webview.onDidReceiveMessage(async (message: CliHubMessage) => {
			if (message.type === 'openAgent' && message.agent && allowedAgents.has(message.agent)) {
				const agent = getCliAgent(message.agent);
				if (!agent || !(await ensureCliInstalled(agent))) {
					return;
				}

				this.pendingInitialAgent = message.agent;
				webviewView.webview.html = this._getAgentHtmlForWebview(webviewView.webview, message.agent);
				return;
			}

			if (message.type === 'backToLauncher') {
				this.sessionManager.detach();
				webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
				return;
			}

			if (message.type === 'cli.ready') {
				this.sessionManager.attach(webviewView.webview);

				if (this.pendingInitialAgent) {
					void this.sessionManager.createSession(this.pendingInitialAgent);
					this.pendingInitialAgent = undefined;
				} else {
					this.sessionManager.postState();
				}

				return;
			}

			if (message.type?.startsWith('cli.')) {
				this.sessionManager.handleMessage(message);
			}
		});
	}

	public dispose() {
		this.sessionManager.dispose();
	}

	private async _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPath = this._getCliHubAssetUri('index.html');
		const stylePath = this._getCliHubAssetUri('global.css');

		const styleUri = webview.asWebviewUri(stylePath);
		const nonce = this._getNonce();
		const contentSecurityPolicy = [
			"default-src 'none'",
			`img-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource}`,
			`script-src 'nonce-${nonce}'`
		].join('; ');

		const installedByLabel = new Map(
			await Promise.all(
				cliAgents.map(async (agent) => [agent.label, await isCliInstalled(agent)] as const)
			)
		);
		const launcherModels = launcherAgents.map((agent) => ({
			label: agent.label,
			aliases: agent.aliases,
			icon: this._getWebviewUri(webview, 'assets', 'icons-cli', agent.iconFile),
			darkIcon: agent.darkIcon === true,
			installed: installedByLabel.get(agent.label) === true
		}));

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		html = html.replace('${styleUri}', styleUri.toString());
		html = html.replace('${contentSecurityPolicy}', contentSecurityPolicy);
		html = html.replace('${nonce}', nonce);
		html = html.replace('${cliModels}', JSON.stringify(launcherModels));

		html = html.replace('${workspacePath}', this._getWorkspacePath());

		return html;
	}

	private _getAgentHtmlForWebview(webview: vscode.Webview, selectedAgent: string) {
		const nonce = this._getNonce();
		const styleUris = [
			this._getWebviewUri(webview, 'global.css'),
			this._getWebviewUri(webview, 'vendor', 'xterm', 'xterm.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'shared', 'styles', 'layout.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'panel-tab', 'tab.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'panel-translate', 'translate.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'panel-terminal', 'terminal.css')
		];
		const scriptUri = this._getWebviewUri(webview, 'webview', 'webview.js');

		return getCliHubWebviewHtml({
			extensionUri: this._extensionUri,
			cspSource: webview.cspSource,
			nonce,
			styleUris,
			scriptUri,
			selectedAgent,
			workspacePath: this._getWorkspacePath()
		});
	}

	private _getCliHubAssetUri(...paths: string[]) {
		return vscode.Uri.joinPath(this._extensionUri, 'dist', 'clihub', ...paths);
	}

	private _getWebviewUri(webview: vscode.Webview, ...paths: string[]) {
		return webview.asWebviewUri(this._getCliHubAssetUri(...paths)).toString();
	}

	private _getWorkspacePath() {
		const fullPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '~/workspace/project';
		const projectName = path.basename(fullPath);

		return `~/${projectName}`;
	}

	private _getNonce() {
		return crypto.randomBytes(16).toString('base64');
	}
}
