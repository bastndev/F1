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
	const history: Snapshot[] = [
		{ value: textarea.value, start: textarea.value.length, end: textarea.value.length },
	];
	let index = 0;
	let isRestoring = false;
	const maxEntries = 200;

	textarea.addEventListener('input', () => {
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

	const restore = (snapshot: Snapshot) => {
		isRestoring = true;
		textarea.value = snapshot.value;
		textarea.setSelectionRange(snapshot.start, snapshot.end);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		isRestoring = false;
	};

	textarea.addEventListener('keydown', (e) => {
		if (!(e.ctrlKey || e.metaKey) || e.altKey) {
			return;
		}
		const key = e.key.toLowerCase();
		if (key !== 'z' && key !== 'y') {
			return;
		}
		e.preventDefault();
		const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
		if (isRedo && index < history.length - 1) {
			restore(history[++index]);
		} else if (!isRedo && index > 0) {
			restore(history[--index]);
		}
	});
}
