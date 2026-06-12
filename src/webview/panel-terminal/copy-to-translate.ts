/**
 * Copy-to-translate detection.
 *
 * TUI CLIs (Claude Code, OpenCode, Grok, Kilo…) enable mouse tracking, so
 * drags never become an xterm.js selection and selection-based auto-open
 * never fires. Those CLIs copy the highlighted text themselves — through the
 * pty with an OSC 52 sequence, or natively (xclip/wl-copy). Both detection
 * paths land here, mirroring the selection flow: remember the text (Shift+F2
 * uses it as the selection fallback) and pop the translator open.
 *
 * The clipboard poll is the fallback for CLIs that copy natively instead of
 * via OSC 52: it watches the system clipboard while the panel is focused and
 * the prompt filter (light toggle) is on. The baseline re-arms on focus, so
 * text copied elsewhere in the IDE can never trigger the translator.
 */
export type CopyToTranslateWatcher = {
	/** Text copied via OSC 52 — arms the baseline and routes to the translator. */
	notifyCopiedText: (text: string, sessionId: string) => void;
	/** Last copied text, used as the terminal-selection fallback. */
	getLastCopiedText: () => string;
};

export const createCopyToTranslateWatcher = (options: {
	pollIntervalMs: number;
	readClipboard: () => Promise<string>;
	isEnabled: () => boolean;
	getActiveSessionId: () => string | undefined;
	isActiveSessionRunning: () => boolean;
	isToolModalOpen: () => boolean;
	openTranslator: () => void;
}): CopyToTranslateWatcher => {
	let lastCopiedText = '';
	let clipboardBaseline: string | undefined;

	const handleCopiedText = (text: string, sessionId?: string) => {
		if (!text.trim()) {
			return;
		}
		lastCopiedText = text;

		if (!options.isEnabled()) {
			return;
		}
		if (sessionId && sessionId !== options.getActiveSessionId()) {
			return;
		}
		if (!options.isActiveSessionRunning()) {
			return;
		}
		// Never remount over an open modal (e.g. the user pressed Copy inside
		// the translator itself, which also lands on the clipboard).
		if (options.isToolModalOpen()) {
			return;
		}
		options.openTranslator();
	};

	window.addEventListener('focus', () => {
		clipboardBaseline = undefined;
	});

	window.setInterval(() => {
		if (!options.isEnabled() || !document.hasFocus() || !options.getActiveSessionId()) {
			return;
		}
		void options.readClipboard().then((text) => {
			if (clipboardBaseline === undefined) {
				clipboardBaseline = text;
				return;
			}
			if (text && text !== clipboardBaseline) {
				clipboardBaseline = text;
				handleCopiedText(text);
			}
		});
	}, options.pollIntervalMs);

	return {
		notifyCopiedText: (text, sessionId) => {
			// Keep the clipboard poll from double-firing on the same copy.
			clipboardBaseline = text;
			handleCopiedText(text, sessionId);
		},
		getLastCopiedText: () => lastCopiedText
	};
};
