import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { allowedAgents, getCliAgent, getAgentSlug } from '../shared/agents';
import { ensureCliInstalled } from './terminal-cli/installation';
import { CliSessionManager } from './terminal-cli/session-manager';
import { getAgentWebviewHtml } from './webview-html';
import { getLauncherWebviewHtml } from './launcher-html';
import { getWebviewAssetUri, getNonce } from './webview-assets';
import { handleWorkspaceListFiles, handleWorkspaceListSkills } from './workspace';
import { translatePromptToEnglish } from './translation/host-prompt-translator';
import { resolveCustomCliLaunch, validateCustomCliCommandInput } from './terminal-cli/custom-cli';
import { VoiceController } from './voice/voice-controller';
import { checkText as spellCheckText, warmSpellchecker } from './spellcheck/host-spellcheck';
import { preparePromptForCLI } from './attachments/host-preparer';
import type { CustomCliLaunch, InboundWebviewMessage } from '../shared/protocol';
import {
	getAgentLaunchGuardMessage,
	type AgentLaunchExtensionMode,
	type AgentLaunchSource
} from '../shared/agent-launch-guard';
import { SmartService, SMART_READY_MARKER } from '../../my-plus/plus';

export class MyCliViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'f1.myCli';
	private readonly sessionManager = new CliSessionManager();
	private readonly smartService = new SmartService();
	private readonly launcherStateSessionId = crypto.randomBytes(16).toString('hex');
	private pendingInitialAgent?: string;
	private pendingInitialSmart = false;
	private pendingInitialCustomCli?: CustomCliLaunch;
	private activePromptTranslation?: AbortController;
	private _activeWebview?: vscode.Webview;
	private _tutorialPanel?: vscode.WebviewPanel;
	private voiceController?: VoiceController;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _extensionContext?: vscode.ExtensionContext
	) {
	}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._activeWebview = webviewView.webview;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				getWebviewAssetUri(this._extensionUri),
				vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets')
			]
		};

		webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
		this.voiceController = new VoiceController(
			(msg) => webviewView.webview.postMessage(msg),
			() => this._extensionContext,
		);
		// VS Code hides a webview view by layout (display:none on the iframe) while
		// keeping the window "visible", so the Page Visibility API inside the webview
		// never fires on a panel switch. retainContextWhenHidden then leaves xterm's
		// canvas/viewport stale, painting a black rectangle on return. onDidChangeVisibility
		// is the only reliable signal — relay it so the webview re-fits and repaints.
		// Voice Finish should only ring when the user's attention is elsewhere.
		// "Watching" = the F1 panel is visible AND the window has OS focus; in that
		// case suppress the cue. Any other state (other panel, collapsed, alt-tabbed
		// to another app, or the panel torn down while hidden) lets it play.
		const updateFinishSoundGate = () => {
			this.sessionManager.setFinishSoundSuppressed(webviewView.visible && vscode.window.state.focused);
		};
		updateFinishSoundGate();
		const windowStateSub = vscode.window.onDidChangeWindowState(updateFinishSoundGate);

		webviewView.onDidChangeVisibility(() => {
			updateFinishSoundGate();
			void webviewView.webview.postMessage({
				type: webviewView.visible ? 'cli.visible' : 'cli.hidden'
			});
		});
		webviewView.onDidDispose(() => {
			windowStateSub.dispose();
			this.sessionManager.detach();
			this._activeWebview = undefined;
		});
		webviewView.webview.onDidReceiveMessage(async (message: InboundWebviewMessage) => {
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
				this.pendingInitialSmart = message.smart === true;
				webviewView.webview.html = this._getAgentHtmlForWebview(webviewView.webview, message.agent);
				return;
			}

			if (message.type === 'customCli.open') {
				const customCli = await this._promptForCustomCliLaunch();
				if (!customCli) {
					return;
				}

				if (message.source === 'launcher') {
					this.pendingInitialAgent = undefined;
					this.pendingInitialCustomCli = customCli;
					webviewView.webview.html = this._getAgentHtmlForWebview(webviewView.webview, customCli.label);
				} else {
					this.sessionManager.createCustomSession(customCli);
				}
				return;
			}

			if (message.type === 'cli.openTutorial') {
				void vscode.env.openExternal(vscode.Uri.parse('https://www.gohit.xyz/extension/f1'));
				return;
			}

			if (message.type === 'cli.focus') {
				void this.smartFocus();
				return;
			}

			if (message.type === 'cli.ready') {
				this.sessionManager.attach(webviewView.webview);
				warmSpellchecker();

				if (this.pendingInitialCustomCli) {
					this.sessionManager.createCustomSession(this.pendingInitialCustomCli);
					this.pendingInitialCustomCli = undefined;
				} else if (this.pendingInitialAgent) {
					const agentLabel = this.pendingInitialAgent;
					const smart = this.pendingInitialSmart;
					this.pendingInitialAgent = undefined;
					this.pendingInitialSmart = false;
					void this._launchInitialAgent(agentLabel, smart);
				} else {
					this.sessionManager.postState();
				}

				return;
			}

			if (message.type === 'prompt.translate') {
				await this._handlePromptTranslate(webviewView.webview, message);
				return;
			}

			if (message.type === 'voice.speak') {
				await this.voiceController?.handleSpeak(message);
				return;
			}

			if (message.type === 'voice.append') {
				await this.voiceController?.handleAppend(message);
				return;
			}

			if (message.type === 'voice.pause') {
				await this.voiceController?.handlePause();
				return;
			}

			if (message.type === 'voice.resume') {
				await this.voiceController?.handleResume();
				return;
			}

			if (message.type === 'voice.stop') {
				await this.voiceController?.handleStop();
				return;
			}

			if (message.type === 'voice.query') {
				await this.voiceController?.handleQueryState();
				return;
			}

			if (message.type === 'voice.checkReady') {
				await this.voiceController?.handleCheckReady(message);
				return;
			}

			if (message.type === 'clipboard.read' && typeof message.id === 'string') {
				let text = '';
				try {
					text = await vscode.env.clipboard.readText();
				} catch (error) {
					console.error('Error reading clipboard:', error);
				}
				await webviewView.webview.postMessage({ type: 'clipboard.text', id: message.id, text });
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

			if (message.type === 'prompt.injectRules') {
				this._handleInjectRules(webviewView.webview, message);
				return;
			}

			if (message.type === 'workspace.listFiles') {
				await handleWorkspaceListFiles(webviewView.webview, message);
				return;
			}

			if (message.type === 'workspace.listSkills') {
				await handleWorkspaceListSkills(webviewView.webview, message);
				return;
			}

			if (message.type === 'mySkills.openCreate') {
				await vscode.commands.executeCommand('f1.mySkills.openCreate');
				return;
			}

			if (message.type === 'cli.create' && message.agent && allowedAgents.has(message.agent)) {
				if (!(await this._confirmAgentLaunch(message.agent, 'panel'))) {
					return;
				}

				if (message.smart === true) {
					const root = this._workspaceRoot();
					this.smartService.prepareContext(root, getAgentSlug(message.agent));
					const graphController = new AbortController();
					const graphReady = this.smartService.buildGraph(root, graphController.signal);
					const sessionId = await this.sessionManager.createSession(message.agent, { smart: true });
					if (!sessionId) {
						graphController.abort();
						return;
					}
					void this._runSmartSession(sessionId, root, graphReady);
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

	/**
	 * Open the CLI Hub tutorial in a webview panel. Content + design system live
	 * in src/shared/tutorial/t-cli/; assets are the shared tutorial images.
	 * Mirrors the My Skills support panel.
	 */
	public async smartFocus() {
		await vscode.commands.executeCommand(`${MyCliViewProvider.viewType}.focus`);
		await this._activeWebview?.postMessage({ type: 'cli.focusTerminal' });
	}

	public notifySkillsChanged() {
		void this._activeWebview?.postMessage({ type: 'workspace.skillsChanged' });
	}

	public openTutorial() {
		if (this._tutorialPanel) {
			this._tutorialPanel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'f1.cliHubTutorial',
			'CLI Hub — Tutorial',
			vscode.ViewColumn.One,
			{ enableScripts: true, localResourceRoots: [this._extensionUri] }
		);
		this._tutorialPanel = panel;
		panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'logo.svg');
		panel.webview.html = this._getCliTutorialHtml(panel.webview, getNonce());
		panel.onDidDispose(() => {
			this._tutorialPanel = undefined;
		});
	}

	private _getCliTutorialHtml(webview: vscode.Webview, nonce: string): string {
		const tutorialDir = vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'tutorial', 't-cli');
		const htmlPath = vscode.Uri.joinPath(tutorialDir, 'support.html').fsPath;

		let content: string;
		try {
			content = fs.readFileSync(htmlPath, 'utf8');
		} catch (err) {
			console.error(`[CLI Hub] Failed to read tutorial template: ${err}`);
			return '<!DOCTYPE html><html><body><p>Failed to load the CLI Hub tutorial.</p></body></html>';
		}

		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(tutorialDir, 'support.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'cli-tutorial.js'));
		const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'logo.svg'));
		const imagesDir = vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'images');
		const authorImageUri = webview.asWebviewUri(vscode.Uri.joinPath(imagesDir, 'author.webp'));

		const body = content
			.replace('{{CREATE_SUPPORT_LOGO_URI}}', logoUri.toString())
			.replace('{{AUTHOR_IMAGE_URI}}', authorImageUri.toString());

		const csp = [
			`default-src 'none';`,
			`base-uri 'none';`,
			`form-action 'none';`,
			`object-src 'none';`,
			`style-src ${webview.cspSource};`,
			`script-src 'nonce-${nonce}';`,
			`img-src ${webview.cspSource};`,
			`font-src ${webview.cspSource};`,
		].join(' ');

		return [
			'<!DOCTYPE html>',
			'<html lang="en">',
			'<head>',
			'<meta charset="UTF-8">',
			'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
			`<meta http-equiv="Content-Security-Policy" content="${csp}">`,
			'<title>CLI Hub: Tutorial</title>',
			`<link href="${styleUri}" rel="stylesheet">`,
			'</head>',
			'<body>',
			body,
			`<script nonce="${nonce}" src="${scriptUri}"></script>`,
			'</body>',
			'</html>',
		].join('');
	}

	public dispose() {
		this._tutorialPanel?.dispose();
		this.activePromptTranslation?.abort();
		this.voiceController?.dispose();
		this.sessionManager.dispose();
	}

	/**
	 * Smart-mode launch. Builds the project graph + writes the rules, starts the
	 * CLI, and once it's booted + idle TYPES one prompt into it so the agent reads
	 * the graph + rules and confirms readiness in its own chat. The generated files
	 * are removed after that first reply settles.
	 */
	private async _launchInitialAgent(agentLabel: string, smart: boolean) {
		if (!smart) {
			void this.sessionManager.createSession(agentLabel);
			return;
		}

		const root = this._workspaceRoot();
		this.smartService.prepareContext(root, getAgentSlug(agentLabel));
		// Build the graph BEFORE writing the rules, so graphify doesn't index our own
		// rules file into the project graph. Abort it if session creation fails so we
		// don't leave a spawned graphify running unattended.
		const graphController = new AbortController();
		const graphReady = this.smartService.buildGraph(root, graphController.signal);

		const sessionId = await this.sessionManager.createSession(agentLabel, { smart: true });
		if (!sessionId) {
			graphController.abort();
			return;
		}

		await this._runSmartSession(sessionId, root, graphReady);
	}

	/**
	 * Smart orchestration shared by the launcher initial-launch path and the
	 * in-panel "create another CLI in smart mode" path. Waits for the graph +
	 * the CLI to be ready, writes the rules, types the priming prompt, and
	 * schedules cleanup after the agent's first reply settles.
	 */
	private async _runSmartSession(sessionId: string, root: string | undefined, graphReady: Promise<boolean>): Promise<void> {
		// Wait until the graph is built AND the CLI is booted + idle.
		const [hasGraph] = await Promise.all([graphReady, this.sessionManager.waitForFirstIdle(sessionId)]);

		// Write the rules, then type one prompt so the agent reads the rules + graph.
		this.smartService.writeRules(root, this.smartService.loadRules(this._extensionUri.fsPath));
		this.sessionManager.sendText(sessionId, this.smartService.composePrompt(hasGraph));

		// Keep the loading overlay up through the whole internal prep: when the
		// agent's first reply settles, verify it surfaced the ready message the
		// priming prompt demands, then clean up + reveal. A hard cap guarantees
		// the overlay never gets stuck if the agent never replies (or never says
		// the ready line) — it reveals unconditionally as the fallback.
		let revealed = false;
		const reveal = () => {
			if (revealed) {
				return;
			}
			revealed = true;
			this.smartService.cleanup(root);
			void this._activeWebview?.postMessage({ type: 'smart.dismiss' });
		};
		const onSettled = () => {
			if (revealed) {
				return;
			}
			if (!this.sessionManager.bufferContains(sessionId, SMART_READY_MARKER)) {
				console.warn('[smart] agent first reply did not contain the ready message; waiting for the hard cap');
				return;
			}
			reveal();
		};
		this.sessionManager.onceResponseSettled(sessionId, onSettled);
		setTimeout(reveal, 90000);
	}

	private _workspaceRoot(): string | undefined {
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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

	private async _promptForCustomCliLaunch() {
		const command = await vscode.window.showInputBox({
			title: 'Open Custom CLI',
			prompt: 'Type an installed CLI command. &',
			placeHolder: 'qwen',
			ignoreFocusOut: true,
			validateInput: validateCustomCliCommandInput
		});

		if (command === undefined) {
			return undefined;
		}

		const result = await resolveCustomCliLaunch(command);
		if (!result.ok) {
			void vscode.window.showWarningMessage(result.message);
			return undefined;
		}

		return result.launch;
	}

	private async _confirmAgentLaunch(agentLabel: string, source: AgentLaunchSource) {
		const guard = getAgentLaunchGuardMessage(agentLabel, {
			source,
			extensionMode: this._getAgentLaunchExtensionMode()
		});
		if (!guard) {
			return true;
		}
		if (!this.sessionManager.hasRunningSessionForAgent(agentLabel)) {
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

	private async _handlePromptTranslate(webview: vscode.Webview, message: InboundWebviewMessage) {
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

	private async _handlePromptPrepare(webview: vscode.Webview, message: InboundWebviewMessage) {
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

	private async _handlePromptSpellcheck(webview: vscode.Webview, message: InboundWebviewMessage) {
		if (typeof message.id !== 'string') {
			return;
		}

		const text = typeof message.text === 'string' ? message.text : '';
		const lang = typeof message.lang === 'string' ? message.lang : 'es';
		const strict = message.strict === true;

		try {
			const issues = await spellCheckText(text, lang, strict);
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

	/**
	 * One-shot "rules" injection from the prompt modal's rules button. Types the
	 * webview-composed rules prompt into the target session and answers once the
	 * agent's reply settles (confirmation marker seen) — reusing the same idle/
	 * settle machinery as the Smart launch, minus the project graph and file
	 * writes. A hard cap guarantees the modal always unblocks.
	 */
	private _handleInjectRules(webview: vscode.Webview, message: InboundWebviewMessage) {
		if (typeof message.id !== 'string') {
			return;
		}
		const id = message.id;
		const sessionId = typeof message.sessionId === 'string' ? message.sessionId : '';
		const text = typeof message.text === 'string' ? message.text : '';
		const marker = typeof message.marker === 'string' ? message.marker : '';

		let answered = false;
		const answer = (ok: boolean) => {
			if (answered) {
				return;
			}
			answered = true;
			void webview.postMessage({ type: 'prompt.rulesInjected', id, ok });
		};

		// Nothing to type into (no session / dead session) — tell the modal so it
		// re-enables the button instead of hanging on the injecting state.
		if (!sessionId || !text || !this.sessionManager.isRunning(sessionId)) {
			answer(false);
			return;
		}

		this.sessionManager.sendText(sessionId, text);
		this.sessionManager.onceResponseSettled(sessionId, () => {
			// Reply settled but the confirmation line isn't in the buffer yet — let
			// the hard cap answer instead of reporting done prematurely.
			if (marker && !this.sessionManager.bufferContains(sessionId, marker)) {
				return;
			}
			answer(true);
		});
		// The rules were typed regardless — cap-answer as success so the button
		// still locks for the session even if the agent never confirmed.
		setTimeout(() => answer(true), 60000);
	}

	private async _postPromptTranslationError(webview: vscode.Webview, id: string, message: string) {
		await webview.postMessage({
			type: 'prompt.translationError',
			id,
			message,
		});
	}

	private async _getHtmlForWebview(webview: vscode.Webview) {
		return getLauncherWebviewHtml(webview, this._extensionUri, this.launcherStateSessionId);
	}

	private _getAgentHtmlForWebview(webview: vscode.Webview, selectedAgent: string) {
		return getAgentWebviewHtml(webview, this._extensionUri, selectedAgent);
	}
}
