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
import {
	ensureVoice,
	isVoiceReady,
	streamSpeech,
	synthesizeSpeech,
	playPcmBuffer,
	stopVoicePlayback,
	isVoiceSpeaking,
} from './voice/host-voice-tts';
import { normalizeVoiceChunks, type ActiveVoiceSession } from './voice/voice-chunks';
import type { VoiceProgress, VoiceState } from '../shared/voice/voice-types';
import { checkText as spellCheckText, warmSpellchecker } from './spellcheck/host-spellcheck';
import { preparePromptForCLI } from './attachments/host-preparer';
import { MemoryService } from '../../my-memory/my-memory';
import type { CustomCliLaunch, InboundWebviewMessage } from '../shared/protocol';
import {
	getAgentLaunchGuardMessage,
	type AgentLaunchExtensionMode,
	type AgentLaunchSource
} from '../shared/agent-launch-guard';

export class MyCliViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'f1.myCli';
	private readonly sessionManager = new CliSessionManager();
	private readonly memoryService = new MemoryService();
	private readonly launcherStateSessionId = crypto.randomBytes(16).toString('hex');
	private pendingInitialAgent?: string;
	private pendingInitialCustomCli?: CustomCliLaunch;
	private activePromptTranslation?: AbortController;
	private activeVoiceSession?: ActiveVoiceSession;
	private voiceRequestSeq = 0;
	private _activeWebview?: vscode.Webview;
	private _memoryWatcher?: vscode.FileSystemWatcher;
	private _memoryWatchTimer?: ReturnType<typeof setTimeout>;
	private _tutorialPanel?: vscode.WebviewPanel;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _extensionContext?: vscode.ExtensionContext
	) {}

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
			this._disposeMemoryWatcher();
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
				this.openTutorial();
				return;
			}

			if (message.type === 'cli.installExtension' && message.extensionId) {
				const extensionId = message.extensionId;

				// Already installed and enabled: the extension owns the shortcut, so stay out of the way.
				if (vscode.extensions.getExtension(extensionId)) {
					return;
				}

				// getExtension() can't distinguish "not installed" from "installed but disabled",
				// so offer both paths: install from the marketplace, or open the page to enable it.
				const install = 'Install';
				const openPage = 'Open Extension';
				const choice = await vscode.window.showInformationMessage(
					'Lynx Keymap shortcuts aren’t active. Install the extension to enable them.',
					install,
					openPage,
				);
				if (choice === install) {
					await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
				} else if (choice === openPage) {
					await vscode.commands.executeCommand('extension.open', extensionId);
				}
				return;
			}

			if (message.type === 'cli.ready') {
				this.sessionManager.attach(webviewView.webview);
				warmSpellchecker();

				const memoryEnabled = this._readMemoryEnabled();
				this.memoryService.setEnabled(memoryEnabled);
				void webviewView.webview.postMessage({ type: 'memory.initialState', enabled: memoryEnabled });

				if (this.pendingInitialCustomCli) {
					this.sessionManager.createCustomSession(this.pendingInitialCustomCli);
					this.pendingInitialCustomCli = undefined;
				} else if (this.pendingInitialAgent) {
					this._memoryOnLaunch(this.pendingInitialAgent);
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

			if (message.type === 'voice.speak') {
				await this._handleVoiceSpeak(webviewView.webview, message);
				return;
			}

			if (message.type === 'voice.pause') {
				await this._handleVoicePause(webviewView.webview);
				return;
			}

			if (message.type === 'voice.resume') {
				await this._handleVoiceResume(webviewView.webview);
				return;
			}

			if (message.type === 'voice.stop') {
				await this._handleVoiceStop(webviewView.webview);
				return;
			}

			if (message.type === 'voice.query') {
				await this._postCurrentVoiceState(webviewView.webview);
				return;
			}

			if (message.type === 'voice.checkReady') {
				await this._handleVoiceCheckReady(webviewView.webview, message);
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

			if (message.type === 'memory.getSnapshot' && typeof message.id === 'string') {
				await this._handleMemoryGetSnapshot(webviewView.webview, message);
				return;
			}

			if (message.type === 'memory.rebuild' && typeof message.id === 'string') {
				await this._handleMemoryRebuild(webviewView.webview, message);
				return;
			}

			if (message.type === 'cli.create' && message.agent && allowedAgents.has(message.agent)) {
				if (!(await this._confirmAgentLaunch(message.agent, 'panel'))) {
					return;
				}
				this._memoryOnLaunch(message.agent);
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
		stopVoicePlayback();
		this._disposeMemoryWatcher();
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

	private async _postVoiceState(
		webview: vscode.Webview,
		state: VoiceState,
		detail?: string,
		progress?: VoiceProgress
	) {
		await webview.postMessage({ type: 'voice.state', state, message: detail, progress });
	}

	private _voiceProgress(session: ActiveVoiceSession): VoiceProgress {
		return {
			chunkIndex: Math.min(session.index, Math.max(0, session.chunks.length - 1)),
			chunkCount: session.chunks.length
		};
	}

	private _voiceChunkLabel(session: ActiveVoiceSession): string | undefined {
		const progress = this._voiceProgress(session);
		return progress.chunkCount > 1 ? `voice ${progress.chunkIndex + 1}/${progress.chunkCount}` : undefined;
	}

	private _isVoiceRunActive(session: ActiveVoiceSession, seq: number): boolean {
		return this.activeVoiceSession === session && seq === this.voiceRequestSeq;
	}

	private async _postCurrentVoiceState(webview: vscode.Webview) {
		const session = this.activeVoiceSession;
		if (session) {
			await this._postVoiceState(webview, session.state, this._voiceChunkLabel(session), this._voiceProgress(session));
			return;
		}

		await this._postVoiceState(webview, isVoiceSpeaking() ? 'speaking' : 'idle');
	}

	private async _handleVoiceSpeak(webview: vscode.Webview, message: InboundWebviewMessage) {
		const chunks = normalizeVoiceChunks(message);
		if (!chunks.length) {
			return;
		}

		if (!this._extensionContext) {
			await this._postVoiceState(webview, 'error', 'Voice unavailable: no extension context.');
			return;
		}

		// A newer speak request supersedes this one; only the latest may
		// report state, otherwise its 'idle' would overwrite 'speaking'.
		const seq = ++this.voiceRequestSeq;
		stopVoicePlayback(false);
		const session: ActiveVoiceSession = {
			chunks,
			index: 0,
			state: 'preparing',
			lang: typeof message.lang === 'string' ? message.lang : 'es',
		};
		this.activeVoiceSession = session;

		await this._runVoiceSession(webview, session, seq);
	}

	private async _handleVoicePause(webview: vscode.Webview) {
		const session = this.activeVoiceSession;
		if (!session || (session.state !== 'preparing' && session.state !== 'speaking')) {
			return;
		}

		this.voiceRequestSeq += 1;
		session.state = 'paused';
		stopVoicePlayback();
		await this._postVoiceState(webview, 'paused', this._voiceChunkLabel(session), this._voiceProgress(session));
	}

	private async _handleVoiceResume(webview: vscode.Webview) {
		const session = this.activeVoiceSession;
		if (!session || session.state !== 'paused') {
			return;
		}

		const seq = ++this.voiceRequestSeq;
		await this._runVoiceSession(webview, session, seq);
	}

	private async _handleVoiceStop(webview: vscode.Webview) {
		this.voiceRequestSeq += 1;
		this.activeVoiceSession = undefined;
		stopVoicePlayback();
		await this._postVoiceState(webview, 'idle');
	}

	private async _handleVoiceCheckReady(webview: vscode.Webview, message: InboundWebviewMessage) {
		if (typeof message.id !== 'string') {
			return;
		}
		const lang = typeof message.lang === 'string' ? message.lang : 'es';
		let ready = false;
		try {
			ready = this._extensionContext ? await isVoiceReady(this._extensionContext, lang) : false;
		} catch {
			// Treat a probe failure as "ready" so the UI doesn't nag with a
			// download prompt; pressing Listen still downloads if truly missing.
			ready = true;
		}
		await webview.postMessage({ type: 'voice.ready', id: message.id, ready });
	}

	private async _runVoiceSession(webview: vscode.Webview, session: ActiveVoiceSession, seq: number) {
		const post = async (state: VoiceState) => {
			if (this._isVoiceRunActive(session, seq)) {
				await this._postVoiceState(webview, state, this._voiceChunkLabel(session), this._voiceProgress(session));
			}
		};

		try {
			if (!this._extensionContext) {
				this.activeVoiceSession = undefined;
				await this._postVoiceState(webview, 'error', 'Voice unavailable: no extension context.');
				return;
			}

			session.state = 'preparing';
			await post('preparing');
			// Reuses ATM's piper engine/voice when installed; downloads into
			// F1's globalStorage (with a progress notification) otherwise.
			session.resources ??= await ensureVoice(this._extensionContext, session.lang);
			const resources = session.resources;
			const chunks = session.chunks;

			// Prefetch helper: synthesize a block to a buffer ahead of time. The no-op
			// .catch keeps a bail (pause/stop kills the in-flight synth) from surfacing
			// as an unhandled rejection; the real await still throws on a genuine failure.
			const startSynth = (text: string) => {
				let ready = false;
				const promise = synthesizeSpeech(resources, text).then((audio) => {
					ready = true;
					return audio;
				});
				void promise.catch(() => undefined);
				return { promise, isReady: () => ready };
			};

			// Best of both worlds:
			//  • The first block of this run STREAMS — audio starts on the first synthesized
			//    bytes, so there's no upfront wait (a single-block read is just this).
			//  • While it plays, the next block is synthesized to a buffer; every later block
			//    plays from its prefetched buffer → seamless, gap-free transitions.
			let pending: { promise: Promise<Buffer>; isReady: () => boolean } | undefined;

			for (let index = session.index; index < chunks.length; index += 1) {
				if (!this._isVoiceRunActive(session, seq)) {
					return;
				}

				session.index = index;
				const nextIndex = index + 1;

				if (!pending) {
					// First block of the run (fresh start or resume): fast streaming start,
					// and begin the next block's prefetch as soon as audio is flowing.
					session.state = 'preparing';
					await post('preparing');
					await streamSpeech(resources, chunks[index], () => {
						if (!this._isVoiceRunActive(session, seq)) {
							return;
						}
						session.state = 'speaking';
						void post('speaking');
						if (nextIndex < chunks.length && !pending) {
							pending = startSynth(chunks[nextIndex]);
						}
					});
					continue;
				}

				// Prefetched block: play it (already, or nearly, synthesized) with no gap,
				// then start synthesizing the one after to overlap this playback.
				const current = pending;
				if (!current.isReady()) {
					session.state = 'preparing';
					await post('preparing');
				}

				let audio: Buffer;
				try {
					audio = await current.promise;
				} catch (error) {
					if (!this._isVoiceRunActive(session, seq)) {
						return;
					}
					throw error;
				}
				if (!this._isVoiceRunActive(session, seq)) {
					return;
				}

				pending = nextIndex < chunks.length ? startSynth(chunks[nextIndex]) : undefined;

				session.state = 'speaking';
				await playPcmBuffer(resources, audio, () => {
					if (this._isVoiceRunActive(session, seq)) {
						session.state = 'speaking';
						void post('speaking');
					}
				});
			}

			if (!this._isVoiceRunActive(session, seq)) {
				return;
			}

			this.activeVoiceSession = undefined;
			session.state = 'idle';
			await this._postVoiceState(webview, 'idle');
		} catch (error) {
			if (!this._isVoiceRunActive(session, seq)) {
				return;
			}

			this.activeVoiceSession = undefined;
			session.state = 'error';
			const detail = error instanceof Error ? error.message : 'Voice playback failed.';
			console.error('[f1-voice] Playback error:', error);
			await this._postVoiceState(webview, 'error', detail);
		}
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

	private _getMemoryWorkspaceRoot(): string | undefined {
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	}

	private _readMemoryEnabled(): boolean {
		return this._extensionContext?.workspaceState.get<boolean>('myMemory.enabled') ?? false;
	}

	private _writeMemoryEnabled(enabled: boolean): void {
		void this._extensionContext?.workspaceState.update('myMemory.enabled', enabled);
	}

	/** Watch the workspace so the button turns yellow when files change. */
	private _ensureMemoryWatcher(): void {
		if (this._memoryWatcher) {
			return;
		}
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return;
		}
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/*'));
		const onEvent = (uri: vscode.Uri) => this._onMemoryFsEvent(uri);
		watcher.onDidCreate(onEvent);
		watcher.onDidChange(onEvent);
		watcher.onDidDelete(onEvent);
		this._memoryWatcher = watcher;
	}

	private _disposeMemoryWatcher(): void {
		if (this._memoryWatchTimer) {
			clearTimeout(this._memoryWatchTimer);
			this._memoryWatchTimer = undefined;
		}
		this._memoryWatcher?.dispose();
		this._memoryWatcher = undefined;
	}

	/** Debounced: a relevant file changed → push a fresh snapshot to the button. */
	private _onMemoryFsEvent(uri: vscode.Uri): void {
		const p = uri.fsPath.replace(/\\/g, '/');
		// Note: we do NOT skip .f1/ here — deleting it must flip the button to red.
		if (/\/(node_modules|\.git|dist|out|build|coverage|\.next|\.cache|graphify-out)\//.test(p)) {
			return;
		}
		if (this._memoryWatchTimer) {
			clearTimeout(this._memoryWatchTimer);
		}
		this._memoryWatchTimer = setTimeout(() => {
			const root = this._getMemoryWorkspaceRoot();
			const webview = this._activeWebview;
			if (!root || !webview) {
				return;
			}
			void webview.postMessage({ type: 'memory.snapshot', id: 'watch', snapshot: this.memoryService.getSnapshot(root) });
		}, 600);
	}

	/** When My Memory is on, point the launching CLI's instructions file at .f1/. */
	private _memoryOnLaunch(agentLabel: string): void {
		if (!this.memoryService.isEnabled()) {
			return;
		}
		this.memoryService.onLaunch(this._getMemoryWorkspaceRoot(), getAgentSlug(agentLabel));
	}

	private async _handleMemoryGetSnapshot(webview: vscode.Webview, message: InboundWebviewMessage) {
		const id = message.id as string;
		const root = this._getMemoryWorkspaceRoot();
		this._activeWebview = webview;

		if (typeof message.enabled === 'boolean') {
			this.memoryService.setEnabled(message.enabled);
			this._writeMemoryEnabled(message.enabled);
			if (message.enabled) {
				this._ensureMemoryWatcher();
				const userInitiated = !message.restore;
				if (userInitiated && !this.memoryService.getSnapshot(root).hasGraphJson) {
					await this._ensureMemoryBuilt(webview, id);
					return;
				}
			} else {
				this._disposeMemoryWatcher();
				this.memoryService.cleanup(root);
			}
		} else if (this.memoryService.isEnabled()) {
			this._ensureMemoryWatcher();
		}

		const snapshot = this.memoryService.getSnapshot(root);
		await webview.postMessage({ type: 'memory.snapshot', id, snapshot });
	}

	private async _handleMemoryRebuild(webview: vscode.Webview, message: InboundWebviewMessage) {
		await this._ensureMemoryBuilt(webview, message.id as string);
	}

	/**
	 * Shared build path for the toggle and the brain button. Ensures the graphify
	 * toolchain is present (offering a one-time native install if not), then
	 * builds the graph + syncs instruction files inside a progress notification.
	 * If the toolchain is missing and the user cancels — or the install fails —
	 * the feature is turned back OFF and the webview drops the button.
	 */
	private async _ensureMemoryBuilt(webview: vscode.Webview, id: string) {
		const root = this._getMemoryWorkspaceRoot();
		if (!root) {
			await webview.postMessage({ type: 'memory.buildError', id, error: 'Open a folder to build project memory.' });
			vscode.window.showWarningMessage('My Memory: open a folder before building project context.');
			await this._memoryDisable(webview);
			return;
		}

		if (!this.memoryService.hasToolchain()) {
			const choice = await vscode.window.showInformationMessage(
				'Install (Python + Graphify) to enable project graph generation. One-time setup 📥.',
				'Install',
				'Cancel'
			);
			if (choice !== 'Install') {
				await this._memoryDisable(webview);
				return;
			}

			try {
				await webview.postMessage({ type: 'memory.buildStart', id });
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'My Memory: installing graphify…', cancellable: false },
					async (progress) => this.memoryService.installToolchain((msg) => {
						progress.report({ message: msg });
						void webview.postMessage({ type: 'memory.buildProgress', id, message: msg });
					})
				);
			} catch (installError) {
				const err = installError instanceof Error ? installError.message : String(installError);
				await webview.postMessage({ type: 'memory.buildError', id, error: err });
				vscode.window.showErrorMessage(`My Memory: graphify install failed. ${err}`);
				await this._memoryDisable(webview);
				return;
			}
		}

		await webview.postMessage({ type: 'memory.buildStart', id });
		const result = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'My Memory: building project context…', cancellable: false },
			async (progress) => this.memoryService.rebuild(root, {
				onProgress: (msg) => {
					progress.report({ message: msg });
					void webview.postMessage({ type: 'memory.buildProgress', id, message: msg });
				}
			})
		);

		if (result.success) {
			await webview.postMessage({ type: 'memory.buildComplete', id, result });
			vscode.window.showInformationMessage('Memory updated · Instruction files synced. ✔');
		} else {
			await webview.postMessage({ type: 'memory.buildError', id, error: result.error || result.message });
			vscode.window.showErrorMessage(`My Memory failed: ${result.error || result.message}`);
		}
	}

	/** Turn the feature OFF and tell the webview to drop the brain button. */
	private async _memoryDisable(webview: vscode.Webview) {
		this.memoryService.setEnabled(false);
		this._writeMemoryEnabled(false);
		this._disposeMemoryWatcher();
		this.memoryService.cleanup(this._getMemoryWorkspaceRoot());
		await webview.postMessage({ type: 'memory.disabled' });
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
