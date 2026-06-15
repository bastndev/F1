/**
 * Webview-side "My Memory" handler.
 * Manages button states, sends messages to host, displays progress/results.
 */

import type { MemorySnapshot, MemoryBuildResult } from '../shared/memory-types';


const MEMORY_ACTION_BUTTON_ID = 'cli-memory-action-button';

type MemoryUIState = 'ready' | 'loading' | 'error' | 'success' | 'missing-python';

let currentSnapshot: MemorySnapshot | undefined;
let currentUIState: MemoryUIState = 'ready';
let pendingRequestId: string | undefined;
let postToHost: (msg: any) => void = () => {};

const getButton = (): HTMLButtonElement | null => document.getElementById(MEMORY_ACTION_BUTTON_ID) as HTMLButtonElement;

const setButtonState = (state: MemoryUIState) => {
	const button = getButton();
	if (!button) {return;}

	currentUIState = state;

	button.disabled = state === 'loading';
	button.classList.remove('is-loading', 'is-error', 'is-success', 'is-missing-python');

	switch (state) {
		case 'loading':
			button.classList.add('is-loading');
			button.title = 'Building memory... (this may take a moment)';
			break;
		case 'error':
			button.classList.add('is-error');
			button.title = 'Memory update failed. Click to retry.';
			break;
		case 'success':
			button.classList.add('is-success');
			button.title = 'Memory updated. Ready to use.';
			setTimeout(() => setButtonState('ready'), 2000);
			break;
		case 'missing-python':
			button.classList.add('is-missing-python');
			button.title = 'Python required. Click to install.';
			break;
		default:
			button.title = 'Update My Memory (build project context)';
	}
};

export const initMemoryHandler = (postMessage: (msg: any) => void) => {
	postToHost = postMessage;

	const button = getButton();
	if (!button) {return;}

	button.addEventListener('click', () => {
		if (currentUIState === 'loading') {return;}
		requestRebuild();
	});

	querySnapshot();
};

/** Called by tab.ts when the My Memory toggle flips, so the host can sync. */
export const notifyMemoryToggle = (enabled: boolean) => {
	postToHost({ type: 'memory.getSnapshot', id: generateRequestId(), enabled });
};

const generateRequestId = (): string => `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Always sends rebuild. The host checks for Python and, if missing, shows a
// native VS Code "Install" dialog — so the install prompt is never a webview confirm().
const requestRebuild = () => {
	setButtonState('loading');
	pendingRequestId = generateRequestId();

	postToHost({
		type: 'memory.rebuild',
		id: pendingRequestId
	});
};

const querySnapshot = () => {
	postToHost({
		type: 'memory.getSnapshot',
		id: generateRequestId()
	});
};

export const handleMemoryMessage = (msg: any) => {
	if (msg.type === 'memory.snapshot') {
		currentSnapshot = msg.snapshot;
		updateButtonAppearance();
	}

	if (msg.type === 'memory.buildStart') {
		if (msg.id === pendingRequestId) {
			setButtonState('loading');
		}
	}

	if (msg.type === 'memory.buildProgress') {
		if (msg.id === pendingRequestId) {
			const button = getButton();
			if (button) {
				button.title = `Building: ${msg.message}`;
			}
		}
	}

	if (msg.type === 'memory.buildComplete') {
		if (msg.id === pendingRequestId) {
			const result: MemoryBuildResult = msg.result;
			if (result.success) {
				showNotification(`✓ Memory updated (${result.durationMs}ms)`);
				setButtonState('success');
			} else {
				showNotification(`✗ Memory update failed: ${result.error || result.message}`);
				setButtonState('error');
			}
			pendingRequestId = undefined;
			querySnapshot();
		}
	}

	if (msg.type === 'memory.buildError') {
		if (msg.id === pendingRequestId) {
			showNotification(`✗ Error: ${msg.error}`);
			setButtonState('error');
			pendingRequestId = undefined;
		}
	}
};

const updateButtonAppearance = () => {
	if (!currentSnapshot) {return;}

	// Don't stomp a loading state while a build we triggered is still in flight.
	if (currentUIState === 'loading' && currentSnapshot.status === 'building') {return;}

	switch (currentSnapshot.status) {
		case 'building':
			setButtonState('loading');
			break;
		case 'missing-python':
			setButtonState('missing-python');
			break;
		case 'error':
			setButtonState('error');
			break;
		case 'ready':
			setButtonState('ready');
			break;
	}
};

const showNotification = (message: string) => {
	console.log('[memory]', message);
};
