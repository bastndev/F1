/**
 * Snapshot-based undo/redo (Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y). Programmatic
 * value writes (lowercase enforcement, marker insertion) wipe the browser's
 * native undo stack, so Ctrl+Z needs its own history. Every input event —
 * typing, paste collapse, marker insertion/deletion — pushes a snapshot;
 * restoring replays value + caret and re-dispatches 'input' so the highlight,
 * char count, draft and run-button state all stay in sync.
 */
export function setupUndoHistory(textarea: HTMLTextAreaElement) {
	type Snapshot = { value: string; start: number; end: number };
	type HistoryInputType = 'historyUndo' | 'historyRedo';
	const history: Snapshot[] = [
		{ value: textarea.value, start: textarea.value.length, end: textarea.value.length },
	];
	let index = 0;
	let isRestoring = false;
	let handledShortcutHistoryInput: HistoryInputType | undefined;
	let clearHandledShortcutHistoryInputTimer: number | undefined;
	const maxEntries = 200;

	const syncCurrentSelection = () => {
		if (isRestoring) {
			return;
		}
		const snapshot = history[index];
		if (!snapshot || snapshot.value !== textarea.value) {
			return;
		}
		snapshot.start = textarea.selectionStart ?? snapshot.value.length;
		snapshot.end = textarea.selectionEnd ?? snapshot.value.length;
	};

	textarea.addEventListener('select', syncCurrentSelection);
	textarea.addEventListener('keyup', syncCurrentSelection);
	textarea.addEventListener('mouseup', syncCurrentSelection);

	const restore = (snapshot: Snapshot) => {
		isRestoring = true;
		textarea.value = snapshot.value;
		textarea.setSelectionRange(snapshot.start, snapshot.end);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		isRestoring = false;
	};

	const clearHandledShortcutHistoryInput = () => {
		handledShortcutHistoryInput = undefined;
		if (clearHandledShortcutHistoryInputTimer !== undefined) {
			window.clearTimeout(clearHandledShortcutHistoryInputTimer);
			clearHandledShortcutHistoryInputTimer = undefined;
		}
	};

	const rememberHandledShortcutHistoryInput = (inputType: HistoryInputType) => {
		clearHandledShortcutHistoryInput();
		handledShortcutHistoryInput = inputType;
		clearHandledShortcutHistoryInputTimer = window.setTimeout(() => {
			if (handledShortcutHistoryInput === inputType) {
				clearHandledShortcutHistoryInput();
			}
		}, 50);
	};

	textarea.addEventListener('input', (e) => {
		const inputType = (e as InputEvent).inputType;
		if (
			(inputType === 'historyUndo' || inputType === 'historyRedo')
			&& handledShortcutHistoryInput === inputType
		) {
			clearHandledShortcutHistoryInput();
			const snapshot = history[index];
			if (snapshot) {
				restore(snapshot);
			}
			return;
		}

		if (isRestoring || history[index]?.value === textarea.value) {
			return;
		}
		history.splice(index + 1);
		history.push({
			value: textarea.value,
			start: textarea.selectionStart ?? textarea.value.length,
			end: textarea.selectionEnd ?? textarea.value.length,
		});
		if (history.length > maxEntries) {
			history.shift();
		}
		index = history.length - 1;
	});

	const hasFullSelection = () => {
		const start = textarea.selectionStart ?? 0;
		const end = textarea.selectionEnd ?? 0;
		return (
			start === 0
			&& end === textarea.value.length
			&& start !== end
		);
	};

	const deleteFullSelection = () => {
		syncCurrentSelection();
		textarea.value = '';
		textarea.setSelectionRange(0, 0);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	};

	const isFullSelectionDeleteInput = (inputType: string) => (
		(inputType === 'deleteContentBackward' || inputType === 'deleteContentForward')
		&& hasFullSelection()
	);

	const restoreHistoryInput = (inputType: HistoryInputType) => {
		const isRedo = inputType === 'historyRedo';
		if (isRedo && index < history.length - 1) {
			restore(history[++index]);
		} else if (!isRedo && index > 0) {
			restore(history[--index]);
		}
	};

	textarea.addEventListener('beforeinput', (e) => {
		const inputType = (e as InputEvent).inputType;
		if (isFullSelectionDeleteInput(inputType)) {
			e.preventDefault();
			deleteFullSelection();
			return;
		}

		if (inputType !== 'historyUndo' && inputType !== 'historyRedo') {
			return;
		}

		e.preventDefault();
		if (handledShortcutHistoryInput === inputType) {
			return;
		}
		clearHandledShortcutHistoryInput();
		restoreHistoryInput(inputType);
	});

	textarea.addEventListener('keydown', (e) => {
		if ((e.key === 'Backspace' || e.key === 'Delete') && hasFullSelection()) {
			e.preventDefault();
			deleteFullSelection();
			return;
		}

		if (!(e.ctrlKey || e.metaKey) || e.altKey) {
			return;
		}
		const key = e.key.toLowerCase();
		if (key !== 'z' && key !== 'y') {
			return;
		}
		e.preventDefault();
		const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
		const inputType: HistoryInputType = isRedo ? 'historyRedo' : 'historyUndo';
		rememberHandledShortcutHistoryInput(inputType);
		restoreHistoryInput(inputType);
	});
}
