/**
 * Message contracts for the two process boundaries:
 *
 * - extension host ↔ webview (`webview.postMessage` / `window message` events)
 * - extension host ↔ pty-host child process (Node IPC)
 *
 * Single source of truth — both sides of each boundary import from here.
 */
import type { AgentLaunchGuardMessage } from './agent-launch-guard';
import type { ImageAttachment, FileMentionEntry, SpellIssue, WorkspaceSkill } from './prompt';
import type { VoiceProgress, VoiceState } from './voice/voice-types';
import type { MemorySnapshot, MemoryBuildResult } from './memory-types';

export type CliSessionStatus = 'running' | 'exited' | 'error';

export type CliSessionSnapshot = {
	id: string;
	label: string;
	commandLine: string;
	cwd: string;
	status: CliSessionStatus;
	createdAt: number;
	/**
	 * Terminal scrollback (≤240KB). Only present the first time a session is
	 * announced to the current webview — afterwards the webview maintains its
	 * own copy from incremental cli.output messages, so re-sending the full
	 * buffer on every state change would be pure overhead.
	 */
	buffer?: string;
	hasUnread: boolean;
	exitCode?: number;
};

export type CliAgentOption = {
	label: string;
};

export type CustomCliLaunch = {
	label: string;
	command: string;
	args: string[];
};

/** Webview → extension host. */
export type WebviewToHostMessage =
	| { type: 'openAgent'; agent: string }
	| { type: 'cli.ready' }
	| { type: 'cli.create'; agent: string; launchGuard?: AgentLaunchGuardMessage }
	| { type: 'customCli.open'; source: 'launcher' | 'panel' }
	| { type: 'cli.input'; sessionId: string; data: string }
	| { type: 'cli.switch'; sessionId: string }
	| { type: 'cli.resize'; sessionId?: string; cols: number; rows: number }
	| { type: 'cli.close'; sessionId: string }
	| { type: 'prompt.translate'; id: string; text: string; from: string; to: string }
	| { type: 'prompt.prepare'; id: string; text: string; attachments: ImageAttachment[] }
	| { type: 'prompt.spellcheck'; id: string; text: string; strict: boolean }
	| { type: 'workspace.listFiles'; id: string }
	| { type: 'workspace.listSkills'; id: string }
	| { type: 'mySkills.openCreate' }
	| { type: 'voice.speak'; text: string; chunks?: string[] }
	| { type: 'voice.pause' }
	| { type: 'voice.resume' }
	| { type: 'voice.stop' }
	| { type: 'voice.query' }
	| { type: 'clipboard.read'; id: string }
	| { type: 'memory.getSnapshot'; id: string }
	| { type: 'memory.rebuild'; id: string };

/** Extension host → webview. */
export type HostToWebviewMessage =
	| {
		type: 'cli.state';
		activeSessionId?: string;
		agents: CliAgentOption[];
		sessions: CliSessionSnapshot[];
	}
	| { type: 'cli.output'; sessionId: string; data: string }
	| { type: 'cli.error'; message: string }
	| { type: 'prompt.translated'; id: string; text: string; provider?: string; fromCache?: boolean }
	| { type: 'prompt.translationError'; id: string; message: string }
	| { type: 'prompt.prepared'; id: string; text: string }
	| { type: 'prompt.prepareError'; id: string; message: string }
	| { type: 'prompt.spellResult'; id: string; issues: SpellIssue[] }
	| { type: 'workspace.files'; id: string; files: FileMentionEntry[] }
	| { type: 'workspace.skills'; id: string; skills: WorkspaceSkill[] }
	| { type: 'voice.state'; state: VoiceState; message?: string; progress?: VoiceProgress }
	| { type: 'clipboard.text'; id: string; text: string }
	| { type: 'memory.snapshot'; id: string; snapshot: MemorySnapshot }
	| { type: 'memory.buildStart'; id: string }
	| { type: 'memory.buildProgress'; id: string; message: string }
	| { type: 'memory.buildComplete'; id: string; result: MemoryBuildResult }
	| { type: 'memory.buildError'; id: string; error: string };

/**
 * Loosely-typed inbound view of WebviewToHostMessage. Webview messages cross
 * a serialization boundary, so host handlers validate fields before trusting
 * them instead of assuming the strict union.
 */
export type InboundWebviewMessage = {
	type?: string;
	agent?: string;
	launchGuard?: AgentLaunchGuardMessage;
	source?: string;
	id?: string;
	text?: string;
	chunks?: unknown;
	from?: string;
	to?: string;
	attachments?: ImageAttachment[];
	strict?: boolean;
	sessionId?: string;
	data?: string;
	cols?: number;
	rows?: number;
	installPython?: boolean;
	overwrite?: boolean;
	enabled?: boolean;
};

/** Extension host → pty-host child process (Node IPC). */
export type PtyHostCommand =
	| {
		type: 'start';
		command: string;
		args: string[];
		cwd: string;
		cols: number;
		rows: number;
		env: Record<string, string>;
	}
	| { type: 'input'; data: string }
	| { type: 'resize'; cols: number; rows: number }
	| { type: 'kill' };

/** pty-host child process → extension host (Node IPC). */
export type PtyHostEvent =
	| { type: 'ready' }
	| { type: 'output'; data: string }
	| { type: 'exit'; exitCode: number; signal?: number | string }
	| { type: 'error'; message: string };

/** Loose inbound view of PtyHostEvent (same defensive-parsing rationale). */
export type InboundPtyHostEvent = {
	type?: string;
	data?: string;
	exitCode?: number;
	signal?: number | string;
	message?: string;
};
