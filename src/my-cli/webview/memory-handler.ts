/**
 * Webview-side "My Memory" handler.
 * Drives the brain button's colour from the host snapshot:
 *   🟢 fresh   = graph up to date     → not clickable (nothing to do)
 *   🟡 stale   = project changed / not built yet → click to build
 *   🟡 setup   = graphify not installed → click to set it up
 *   🔴 missing = .f1/ deleted or broken → click to rebuild
 *   ⏳ loading = a build/install is in flight
 * All native dialogs/notifications live on the host.
 */

import type { MemorySnapshot } from '../shared/memory-types';

const MEMORY_ACTION_BUTTON_ID = 'cli-memory-action-button';

type MemoryUIState = 'loading' | 'fresh' | 'stale' | 'setup' | 'missing';

let currentSnapshot: MemorySnapshot | undefined;
let currentUIState: MemoryUIState = 'fresh';
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
	// Green "up to date" is intentionally not clickable — nothing to do.
	button.disabled = state === 'loading' || state === 'fresh';
	button.classList.remove('is-loading', 'is-fresh', 'is-stale', 'is-error');

	switch (state) {
		case 'loading':
			button.classList.add('is-loading');
			button.title = 'Working… (building project context)';
			break;
		case 'fresh':
			button.classList.add('is-fresh');
			button.title = 'Project memory is up to date.';
			break;
		case 'stale':
			button.classList.add('is-stale');
			button.title = 'Project changed — click to update memory.';
			break;
		case 'setup':
			button.classList.add('is-stale');
			button.title = 'Click to set up graphify and build project memory.';
			break;
		case 'missing':
			button.classList.add('is-error');
			button.title = 'Project memory missing — click to rebuild.';
			break;
	}
};

export const initMemoryHandler = (postMessage: (msg: any) => void) => {
	postToHost = postMessage;

	const button = getButton();
	if (!button) {
		return;
	}

	button.addEventListener('click', () => {
		if (button.disabled || currentUIState === 'loading') {
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

/**
 * Called by tab.ts when the toggle flips. `restore` means we're re-syncing an
 * already-on toggle after a reload — the host should enable + watch but NOT
 * auto-build.
 */
export const notifyMemoryToggle = (enabled: boolean, restore = false) => {
	const id = generateRequestId();
	pendingRequestId = enabled ? id : undefined;
	postToHost({ type: 'memory.getSnapshot', id, enabled, restore });
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
			// A snapshot carrying our pending id means that operation resolved
			// without a build (enable-with-existing-graph, or a reload restore).
			if (msg.id === pendingRequestId) {
				pendingRequestId = undefined;
			}
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
		case 'memory.buildError':
			if (msg.id === pendingRequestId) {
				// Result is reported by the host's native notification; the button
				// just re-reads the real .f1/ state.
				pendingRequestId = undefined;
				querySnapshot();
			}
			break;

		case 'memory.disabled':
			pendingRequestId = undefined;
			forceDisableCb?.();
			break;
	}
};

const updateButtonAppearance = () => {
	if (!currentSnapshot) {
		return;
	}
	// A build/install we triggered is still in flight — let it own the button.
	if (pendingRequestId !== undefined) {
		return;
	}

	switch (currentSnapshot.status) {
		case 'building':
		case 'installing':
			setButtonState('loading');
			break;
		case 'missing-toolchain':
			setButtonState('setup');
			break;
		case 'error':
			setButtonState('missing');
			break;
		case 'ready':
			setButtonState(currentSnapshot.hasGraphJson && !currentSnapshot.stale ? 'fresh' : 'stale');
			break;
	}
};
