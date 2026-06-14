import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { allowedAgents, getCliAgent } from '../shared/agents';
import { ensureCliInstalled } from './terminal-cli/installation';
import { CliSessionManager } from './terminal-cli/session-manager';
import { getAgentWebviewHtml } from './webview-html';
import { getLauncherWebviewHtml } from './launcher-html';
import { getWebviewAssetUri } from './webview-assets';
import { handleWorkspaceListFiles, handleWorkspaceListSkills } from './workspace';
import { translatePromptToEnglish } from './translation/host-prompt-translator';
import { resolveCustomCliLaunch, validateCustomCliCommandInput } from './terminal-cli/custom-cli';
import {
	ensureSpanishVoice,
	playSpanishText,
	stopVoicePlayback,
	isVoiceSpeaking,
	type VoiceResources
} from './voice/host-voice-tts';
import type { VoiceProgress, VoiceState } from '../shared/voice/voice-types';
import { checkText as spellCheckText, warmSpellchecker } from './spellcheck/host-spellcheck';
import { preparePromptForCLI } from './attachments/host-preparer';
import type { CustomCliLaunch, InboundWebviewMessage } from '../shared/protocol';
import {
	getAgentLaunchGuardMessage,
	type AgentLaunchExtensionMode,
	type AgentLaunchSource
} from '../shared/agent-launch-guard';

const maxVoiceTotalChars = 60000;
const maxVoiceChunkChars = 1400;
const maxVoiceChunks = 120;

type ActiveVoiceSession = {
	chunks: string[];
	index: number;
	state: VoiceState;
	resources?: VoiceResources;
};

function normalizeVoiceText(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function splitLongVoiceSegment(segment: string, maxChars: number): string[] {
	const chunks: string[] = [];
	let current = '';

	for (const part of segment.match(/\s+|\S+/g) ?? []) {
		if (part.length > maxChars) {
			if (current.trim()) {
				chunks.push(current.trim());
			}
			current = '';
			for (let index = 0; index < part.length; index += maxChars) {
				chunks.push(part.slice(index, index + maxChars));
			}
			continue;
		}

		if (current && current.length + part.length > maxChars) {
			chunks.push(current.trim());
			current = part.trimStart();
			continue;
		}

		current += part;
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks;
}

function splitVoiceText(text: string, maxChars: number): string[] {
	const clean = normalizeVoiceText(text);
	if (!clean) {
		return [];
	}
	if (clean.length <= maxChars) {
		return [clean];
	}

	const chunks: string[] = [];
	let current = '';
	const flush = () => {
		if (current.trim()) {
			chunks.push(current.trim());
			current = '';
		}
	};

	const paragraphs = clean.split(/\n{2,}/);
	for (const paragraph of paragraphs) {
		const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [paragraph];
		for (const sentence of sentences) {
			const piece = sentence.trim();
			if (!piece) {
				continue;
			}
			if (piece.length > maxChars) {
				flush();
				chunks.push(...splitLongVoiceSegment(piece, maxChars));
				continue;
			}
			const next = current ? `${current} ${piece}` : piece;
			if (next.length > maxChars) {
				flush();
				current = piece;
			} else {
				current = next;
			}
		}
		flush();
	}

	return chunks;
}

function normalizeVoiceChunks(message: InboundWebviewMessage): string[] {
	const rawChunks = Array.isArray(message.chunks)
		? message.chunks.filter((chunk): chunk is string => typeof chunk === 'string')
		: (typeof message.text === 'string' ? [message.text] : []);

	const chunks: string[] = [];
	let totalChars = 0;

	for (const raw of rawChunks) {
		for (const piece of splitVoiceText(raw, maxVoiceChunkChars)) {
			const remaining = maxVoiceTotalChars - totalChars;
			if (remaining <= 0 || chunks.length >= maxVoiceChunks) {
				return chunks;
			}

			const value = piece.length > remaining ? piece.slice(0, remaining).trimEnd() : piece;
			if (!value) {
				continue;
			}

			chunks.push(value);
			totalChars += value.length;
		}
	}

	return chunks;
}

export class MyCliViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'f1.myCli';
	private readonly sessionManager = new CliSessionManager();
	private readonly launcherStateSessionId = crypto.randomBytes(16).toString('hex');
	private pendingInitialAgent?: string;
	private pendingInitialCustomCli?: CustomCliLaunch;
	private activePromptTranslation?: AbortController;
	private activeVoiceSession?: ActiveVoiceSession;
	private voiceRequestSeq = 0;

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
			localResourceRoots: [
				getWebviewAssetUri(this._extensionUri),
				vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets')
			]
		};

		webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
		webviewView.onDidDispose(() => {
			this.sessionManager.detach();
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

			if (message.type === 'cli.ready') {
				this.sessionManager.attach(webviewView.webview);
				warmSpellchecker();

				if (this.pendingInitialCustomCli) {
					this.sessionManager.createCustomSession(this.pendingInitialCustomCli);
					this.pendingInitialCustomCli = undefined;
				} else if (this.pendingInitialAgent) {
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
		stopVoicePlayback();
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
			state: 'preparing'
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
			session.resources ??= await ensureSpanishVoice(this._extensionContext);

			for (let index = session.index; index < session.chunks.length; index += 1) {
				if (!this._isVoiceRunActive(session, seq)) {
					return;
				}

				session.index = index;
				session.state = 'preparing';
				await post('preparing');
				// 'preparing' holds through synthesis; 'speaking' fires only once
				// the first audio bytes flow, so the UI animates with the sound.
				await playSpanishText(session.resources, session.chunks[index], () => {
					if (!this._isVoiceRunActive(session, seq)) {
						return;
					}
					session.state = 'speaking';
					void post('speaking');
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
		return getLauncherWebviewHtml(webview, this._extensionUri, this.launcherStateSessionId);
	}

	private _getAgentHtmlForWebview(webview: vscode.Webview, selectedAgent: string) {
		return getAgentWebviewHtml(webview, this._extensionUri, selectedAgent);
	}
}
