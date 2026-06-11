import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { allowedAgents, cliAgents, getCliAgent } from './webview/core/terminal-cli/agents';
import { ensureCliInstalled, isCliInstalled } from './webview/core/terminal-cli/installation';
import { CliSessionManager } from './webview/core/terminal-cli/session-manager';
import { getCliHubWebviewHtml } from './webview/webview';
import { translatePromptToEnglish } from './webview/core/tools-cli-core/modal-translation/host-prompt-translator';
import { checkText as spellCheckText, warmSpellchecker } from './webview/core/tools-cli-core/autocorrect/host-spellcheck';
import { preparePromptForCLI } from './webview/core/tools-cli-core/prompt/attachments/host-preparer';
import type { ImageAttachment } from './webview/core/tools-cli-core/prompt';
import {
	getAgentLaunchGuardMessage,
	type AgentLaunchExtensionMode,
	type AgentLaunchGuardMessage,
	type AgentLaunchSource
} from './webview/ui/panel-terminal/agent-safety/agent-launch-guard';

type CliHubMessage = {
	type?: string;
	agent?: string;
	launchGuard?: AgentLaunchGuardMessage;
	id?: string;
	text?: string;
	from?: string;
	to?: string;
	attachments?: ImageAttachment[];
	strict?: boolean;
};

type LauncherAgent = {
	label: string;
	aliases: string[];
	iconFile: string;
	darkIcon?: boolean;
	lightIcon?: boolean;
};

const launcherAgents: LauncherAgent[] = [
	{ label: 'OpenCode', aliases: ['opencode', 'open code', 'op'], iconFile: 'opencode.svg', lightIcon: true },
	{ label: 'Codex CLI', aliases: ['codex', 'codex cli', 'code', 'co', 'c'], iconFile: 'codex.svg' },
	{ label: 'Claude Code', aliases: ['claude', 'claude code'], iconFile: 'claudecode.svg' },
	{ label: 'Antigravity CLI', aliases: ['antigravity', 'antigravity cli', 'agy', 'an', 'ant'], iconFile: 'Antigravity_cli.svg' },
	{ label: 'Copilot CLI', aliases: ['github copilot', 'copilot', 'copilot cli'], iconFile: 'github-copilot.svg', darkIcon: true },
	{ label: 'Cursor', aliases: ['cursor'], iconFile: 'cursor.svg', darkIcon: true },
	{ label: 'Amp', aliases: ['amp'], iconFile: 'amp.svg' },
	{ label: 'Kiro CLI', aliases: ['kiro', 'kiro cli'], iconFile: 'kiro.svg' },
	{ label: 'Kilo Code', aliases: ['kilo', 'kilo code', 'code', 'k'], iconFile: 'kilocode.svg', darkIcon: true },
	{ label: 'Grok', aliases: ['grok'], iconFile: 'grok.svg', darkIcon: true }
];

const serializeJsonForHtmlScript = (value: unknown) => {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
};

export class CliHubViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'f1.cliHub';
	private readonly sessionManager = new CliSessionManager();
	private readonly launcherStateSessionId = crypto.randomBytes(16).toString('hex');
	private pendingInitialAgent?: string;
	private activePromptTranslation?: AbortController;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _extensionContext?: vscode.ExtensionContext
	) {}

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
				if (!agent) {
					return;
				}

				if (!(await this._confirmAgentLaunch(message.agent, 'launcher'))) {
					return;
				}

				if (!(await ensureCliInstalled(agent))) {
					return;
				}

				this.pendingInitialAgent = message.agent;
				webviewView.webview.html = this._getAgentHtmlForWebview(webviewView.webview, message.agent);
				return;
			}

			if (message.type === 'cli.ready') {
				this.sessionManager.attach(webviewView.webview);
				warmSpellchecker();

				if (this.pendingInitialAgent) {
					void this.sessionManager.createSession(this.pendingInitialAgent);
					this.pendingInitialAgent = undefined;
				} else {
					this.sessionManager.postState();
				}

				return;
			}

			if (message.type === 'prompt.translate') {
				await this._handlePromptTranslate(webviewView.webview, message);
				return;
			}

			if (message.type === 'prompt.prepare') {
				await this._handlePromptPrepare(webviewView.webview, message);
				return;
			}

			if (message.type === 'prompt.spellcheck') {
				await this._handlePromptSpellcheck(webviewView.webview, message);
				return;
			}

			if (message.type === 'workspace.listFiles') {
				await this._handleWorkspaceListFiles(webviewView.webview, message);
				return;
			}

			if (message.type === 'cli.create' && message.agent && allowedAgents.has(message.agent)) {
				if (!(await this._confirmAgentLaunch(message.agent, 'panel'))) {
					return;
				}
			}

			if (message.type?.startsWith('cli.')) {
				const result = this.sessionManager.handleMessage(message);
				if (result === 'closed-last-session') {
					this.sessionManager.detach();
					webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
				}
			}
		});
	}

	public dispose() {
		this.activePromptTranslation?.abort();
		this.sessionManager.dispose();
	}

	private _getAgentLaunchExtensionMode(): AgentLaunchExtensionMode {
		if (this._extensionContext?.extensionMode === vscode.ExtensionMode.Development) {
			return 'development';
		}
		if (this._extensionContext?.extensionMode === vscode.ExtensionMode.Test) {
			return 'test';
		}
		if (this._extensionContext?.extensionMode === vscode.ExtensionMode.Production) {
			return 'production';
		}

		return 'unknown';
	}

	private async _confirmAgentLaunch(agentLabel: string, source: AgentLaunchSource) {
		const guard = getAgentLaunchGuardMessage(agentLabel, {
			source,
			extensionMode: this._getAgentLaunchExtensionMode()
		});
		if (!guard) {
			return true;
		}

		const choice = await vscode.window.showWarningMessage(
			guard.message,
			{ modal: true, detail: guard.detail },
			guard.confirmLabel,
			guard.cancelLabel
		);

		return choice === guard.confirmLabel;
	}

	private async _handleWorkspaceListFiles(webview: vscode.Webview, message: CliHubMessage) {
		if (typeof message.id !== 'string') {
			return;
		}

		try {
			// Find files excluding common ignored directories
			const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}', 1000);
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			
			const files = uris.map(uri => {
				const isDirectory = false; // findFiles only returns files
				const name = path.basename(uri.fsPath);
				// Get relative path if within workspace, else use full fsPath
				let relativePath = uri.fsPath;
				if (workspaceFolder && uri.fsPath.startsWith(workspaceFolder.uri.fsPath)) {
					relativePath = uri.fsPath.substring(workspaceFolder.uri.fsPath.length + 1);
					// Replace backslashes with forward slashes for consistency
					relativePath = relativePath.replace(/\\/g, '/');
				}

				return {
					name,
					path: relativePath,
					isDirectory
				};
			});

			// If we also want directories, we could get unique directory paths from the files list
			const dirs = new Set<string>();
			files.forEach(f => {
				const dirPath = path.dirname(f.path);
				if (dirPath !== '.') {
					// Add all parent directories
					let current = dirPath;
					while (current !== '.' && current !== '') {
						dirs.add(current);
						current = path.dirname(current);
					}
				}
			});

			const allEntries = [...files];
			dirs.forEach(dir => {
				allEntries.push({
					name: path.basename(dir),
					path: dir,
					isDirectory: true
				});
			});

			await webview.postMessage({
				type: 'workspace.files',
				id: message.id,
				files: allEntries
			});
		} catch (error) {
			console.error('Error listing workspace files:', error);
			await webview.postMessage({
				type: 'workspace.files',
				id: message.id,
				files: [] // Return empty on error
			});
		}
	}

	private async _handlePromptTranslate(webview: vscode.Webview, message: CliHubMessage) {
		if (typeof message.id !== 'string') {
			return;
		}

		if (typeof message.text !== 'string') {
			await this._postPromptTranslationError(webview, message.id, 'No text provided for translation.');
			return;
		}

		this.activePromptTranslation?.abort();
		const controller = new AbortController();
		this.activePromptTranslation = controller;

		try {
			const result = await translatePromptToEnglish({
				text: message.text,
				from: message.from || 'es',
				to: message.to || 'en',
				signal: controller.signal,
			});

			await webview.postMessage({
				type: 'prompt.translated',
				id: message.id,
				text: result.text,
				provider: result.providerName,
				fromCache: result.fromCache,
			});
		} catch (error) {
			if (controller.signal.aborted) {
				return;
			}

			await this._postPromptTranslationError(
				webview,
				message.id,
				error instanceof Error ? error.message : 'Translation failed.'
			);
		} finally {
			if (this.activePromptTranslation === controller) {
				this.activePromptTranslation = undefined;
			}
		}
	}

	private async _handlePromptPrepare(webview: vscode.Webview, message: CliHubMessage) {
		if (typeof message.id !== 'string') {
			return;
		}

		const text = typeof message.text === 'string' ? message.text : '';
		const attachments = Array.isArray(message.attachments) ? message.attachments : [];

		try {
			const ctx = this._extensionContext || { globalStorageUri: undefined } as any;
			const preparedText = await preparePromptForCLI(text, attachments as any, ctx);

			await webview.postMessage({
				type: 'prompt.prepared',
				id: message.id,
				text: preparedText,
			});
		} catch (error) {
			await webview.postMessage({
				type: 'prompt.prepareError',
				id: message.id,
				message: error instanceof Error ? error.message : 'Failed to prepare image attachments.',
			});
		}
	}

	private async _handlePromptSpellcheck(webview: vscode.Webview, message: CliHubMessage) {
		if (typeof message.id !== 'string') {
			return;
		}

		const text = typeof message.text === 'string' ? message.text : '';
		const strict = message.strict === true;

		try {
			const issues = await spellCheckText(text, strict);
			await webview.postMessage({
				type: 'prompt.spellResult',
				id: message.id,
				issues,
			});
		} catch {
			// Spell-marking is best-effort; never block the prompt on a failure.
			await webview.postMessage({
				type: 'prompt.spellResult',
				id: message.id,
				issues: [],
			});
		}
	}

	private async _postPromptTranslationError(webview: vscode.Webview, id: string, message: string) {
		await webview.postMessage({
			type: 'prompt.translationError',
			id,
			message,
		});
	}

	private async _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPath = this._getCliHubAssetUri('index.html');
		const stylePath = this._getCliHubAssetUri('global.css');

		const styleUri = webview.asWebviewUri(stylePath);
		const scriptUri = this._getWebviewUri(webview, 'index.js');
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
			lightIcon: agent.lightIcon === true,
			installed: installedByLabel.get(agent.label) === true
		}));

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		html = html.replace('${styleUri}', styleUri.toString());
		html = html.replace('${scriptUri}', scriptUri);
		html = html.replace('${contentSecurityPolicy}', contentSecurityPolicy);
		html = html.replace(/\$\{nonce\}/g, nonce);
		html = html.replace('${cliModels}', serializeJsonForHtmlScript(launcherModels));
		html = html.replace('${launcherStateSessionId}', serializeJsonForHtmlScript(this.launcherStateSessionId));
		html = html.replace('${workspacePath}', this._getWorkspacePath());

		return html;
	}

	private _getAgentHtmlForWebview(webview: vscode.Webview, selectedAgent: string) {
		const nonce = this._getNonce();
		const styleUris = [
			this._getWebviewUri(webview, 'global.css'),
			this._getWebviewUri(webview, 'vendor', 'xterm', 'xterm.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'styles', 'layout.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'panel-tab', 'tab.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'panel-terminal', 'terminal.css'),
			this._getWebviewUri(webview, 'webview', 'ui', 'styles', 'skeleton', 'start-cli.css')
		];
		const scriptUri = this._getWebviewUri(webview, 'webview', 'webview.js');
		const agentIcons = launcherAgents.map((agent) => ({
			label: agent.label,
			icon: this._getWebviewUri(webview, 'assets', 'icons-cli', agent.iconFile),
			darkIcon: agent.darkIcon === true,
			lightIcon: agent.lightIcon === true
		}));

		return getCliHubWebviewHtml({
			extensionUri: this._extensionUri,
			cspSource: webview.cspSource,
			nonce,
			styleUris,
			scriptUri,
			selectedAgent,
			workspacePath: this._getWorkspacePath(),
			agentIcons: serializeJsonForHtmlScript(agentIcons)
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
