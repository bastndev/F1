/**
 * Host round-trips for the terminal panel — one RPC channel per
 * request/response message pair (see host-rpc.ts), plus the two convenience
 * wrappers the tool modals consume. Extracted from terminal.ts as a
 * createHostRpcChannels(post) factory (mirrors createUsageTracker); the
 * message loop resolves/rejects each channel from the matching host reply.
 */
import { createRpcChannel } from './host-rpc';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue, WorkspaceSkill } from '../../shared/prompt';
import type { WebviewToHostMessage } from '../../shared/protocol';

export type HostRpcChannels = ReturnType<typeof createHostRpcChannels>;

export const createHostRpcChannels = (post: (message: WebviewToHostMessage) => void) => {
	// Generous ceiling: long selections fan out into many sequential
	// provider requests on the host (450-byte chunks on MyMemory).
	const promptTranslate = createRpcChannel<[PromptTranslateRequest], PromptTranslateResult>({
		prefix: 'prompt-translate',
		timeoutMs: 60000,
		onTimeout: { rejectMessage: 'Translation timed out.' },
		send: (id, request) => post({
			type: 'prompt.translate',
			id,
			text: request.text,
			from: request.from,
			to: request.to,
		})
	});

	const promptPrepare = createRpcChannel<[string, ImageAttachment[]], string>({
		prefix: 'prompt-prepare',
		timeoutMs: 30000,
		onTimeout: { rejectMessage: 'Image attachment prepare timed out.' },
		send: (id, text, attachments) => post({ type: 'prompt.prepare', id, text, attachments })
	});

	const workspaceFiles = createRpcChannel<[], FileMentionEntry[]>({
		prefix: 'ws-files',
		timeoutMs: 5000,
		onTimeout: { resolveWith: [] },
		send: (id) => post({ type: 'workspace.listFiles', id })
	});

	const workspaceSkills = createRpcChannel<[], WorkspaceSkill[]>({
		prefix: 'ws-skills',
		timeoutMs: 5000,
		onTimeout: { resolveWith: [] },
		send: (id) => post({ type: 'workspace.listSkills', id })
	});

	const clipboardRead = createRpcChannel<[], string>({
		prefix: 'clipboard-read',
		timeoutMs: 3000,
		onTimeout: { resolveWith: '' },
		send: (id) => post({ type: 'clipboard.read', id })
	});

	const spellcheck = createRpcChannel<[string, string, boolean], SpellIssue[]>({
		prefix: 'spell',
		timeoutMs: 5000,
		onTimeout: { resolveWith: [] },
		send: (id, text, lang, strict) => post({ type: 'prompt.spellcheck', id, text, lang, strict })
	});

	// One-shot rules injection: the host types the rules prompt into the CLI and
	// answers when the agent has read it (or its own hard cap fires). The timeout
	// sits above that host cap so the modal always unblocks; a miss resolves false.
	const injectRules = createRpcChannel<[string, string, string, boolean], boolean>({
		prefix: 'inject-rules',
		timeoutMs: 70000,
		onTimeout: { resolveWith: false },
		send: (id, sessionId, text, marker, focusReporting) => post({ type: 'prompt.injectRules', id, sessionId, text, marker, focusReporting })
	});

	// Ask the host whether the voice for a language is already downloaded, so the
	// Listen button can show a "download" affordance before the first click.
	const voiceReady = createRpcChannel<[string], boolean>({
		prefix: 'voice-ready',
		timeoutMs: 5000,
		// On no answer assume ready — don't show a download prompt we're unsure about.
		onTimeout: { resolveWith: true },
		send: (id, lang) => post({ type: 'voice.checkReady', id, lang })
	});

	const translatePrompt = (request: PromptTranslateRequest): Promise<PromptTranslateResult> => {
		return promptTranslate.request(request);
	};

	const preparePromptWithAttachments = (text: string, attachments: ImageAttachment[]): Promise<string> => {
		if (!attachments || attachments.length === 0) {
			// No images — just return original (caller can still send)
			return Promise.resolve(text);
		}

		return promptPrepare.request(text, attachments);
	};

	return {
		promptTranslate,
		promptPrepare,
		workspaceFiles,
		workspaceSkills,
		clipboardRead,
		spellcheck,
		injectRules,
		voiceReady,
		translatePrompt,
		preparePromptWithAttachments
	};
};
