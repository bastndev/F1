/**
 * Webview-side "My Memory" handler.
 * Drives the brain button's state and exchanges messages with the host. All
 * native dialogs/notifications (install prompt, progress) live on the host —
 * this side only reflects state and forwards intent.
 */

import type { MemorySnapshot, MemoryBuildResult } from '../shared/memory-types';

const MEMORY_ACTION_BUTTON_ID = 'cli-memory-action-button';

type MemoryUIState = 'ready' | 'loading' | 'error' | 'success' | 'missing-toolchain';

let currentSnapshot: MemorySnapshot | undefined;
let currentUIState: MemoryUIState = 'ready';
let pendingRequestId: string | undefined;
let postToHost: (msg: any) => void = () => {};
let forceDisableCb: (() => void) | undefined;

const getButton = (): HTMLButtonElement | null =>
	document.getElementById(MEMORY_ACTION_BUTTON_ID) as HTMLButtonElement | null;

const generateRequestId = (): string => `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const setButtonState = (state: MemoryUIState) => {
	const button = getButton();
	if (!button) {
		return;
	}

	currentUIState = state;
	button.disabled = state === 'loading';
	button.classList.remove('is-loading', 'is-error', 'is-success', 'is-missing-python');

	switch (state) {
		case 'loading':
			button.classList.add('is-loading');
			button.title = 'Working… (building project context)';
			break;
		case 'error':
			button.classList.add('is-error');
			button.title = 'Project memory missing or incomplete. Click to rebuild.';
			break;
		case 'success':
			button.classList.add('is-success');
			button.title = 'Memory updated. Ready to use.';
			setTimeout(() => setButtonState('ready'), 2000);
			break;
		case 'missing-toolchain':
			button.classList.add('is-missing-python');
			button.title = 'graphify not installed. Click to set up.';
			break;
		default:
			button.title = 'Update My Memory (build project graph)';
	}
};

export const initMemoryHandler = (postMessage: (msg: any) => void) => {
	postToHost = postMessage;

	const button = getButton();
	if (!button) {
		return;
	}

	button.addEventListener('click', () => {
		if (currentUIState === 'loading') {
			return;
		}
		requestRebuild();
	});

	querySnapshot();
};

/** tab.ts registers how to force the toggle OFF when the host backs out. */
export const onMemoryForceDisable = (cb: () => void) => {
	forceDisableCb = cb;
};

/** Called by tab.ts when the My Memory toggle flips, so the host can sync. */
export const notifyMemoryToggle = (enabled: boolean) => {
	const id = generateRequestId();
	if (enabled) {
		// Turning ON kicks off a build (host installs graphify first if needed),
		// so track this id and show the spinner right away.
		pendingRequestId = id;
		setButtonState('loading');
	}
	postToHost({ type: 'memory.getSnapshot', id, enabled });
};

const requestRebuild = () => {
	pendingRequestId = generateRequestId();
	setButtonState('loading');
	postToHost({ type: 'memory.rebuild', id: pendingRequestId });
};

const querySnapshot = () => {
	postToHost({ type: 'memory.getSnapshot', id: generateRequestId() });
};

export const handleMemoryMessage = (msg: any) => {
	switch (msg.type) {
		case 'memory.snapshot':
			currentSnapshot = msg.snapshot as MemorySnapshot;
			updateButtonAppearance();
			break;

		case 'memory.buildStart':
			if (msg.id === pendingRequestId) {
				setButtonState('loading');
			}
			break;

		case 'memory.buildProgress':
			if (msg.id === pendingRequestId) {
				const button = getButton();
				if (button) {
					button.title = msg.message;
				}
			}
			break;

		case 'memory.buildComplete':
			if (msg.id === pendingRequestId) {
				const result: MemoryBuildResult = msg.result;
				pendingRequestId = undefined;
				if (result.success) {
					setButtonState('success');
				} else {
					// A failed build speaks through the host's notification. The button
					// reflects the real .f1/ state — red only if .f1/ is truly missing,
					// never just because a build errored.
					currentUIState = 'ready';
					querySnapshot();
				}
			}
			break;

		case 'memory.buildError':
			if (msg.id === pendingRequestId) {
				pendingRequestId = undefined;
				currentUIState = 'ready';
				querySnapshot();
			}
			break;

		case 'memory.disabled':
			// Host cancelled/failed the install — turn the toggle off + drop button.
			pendingRequestId = undefined;
			currentUIState = 'ready';
			forceDisableCb?.();
			break;
	}
};

const updateButtonAppearance = () => {
	if (!currentSnapshot) {
		return;
	}
	// Don't stomp an in-flight build or the brief success flash.
	if (currentUIState === 'loading' || currentUIState === 'success') {
		return;
	}

	switch (currentSnapshot.status) {
		case 'building':
		case 'installing':
			setButtonState('loading');
			break;
		case 'missing-toolchain':
			setButtonState('missing-toolchain');
			break;
		case 'error':
			setButtonState('error');
			break;
		case 'ready':
			setButtonState('ready');
			break;
	}
};
