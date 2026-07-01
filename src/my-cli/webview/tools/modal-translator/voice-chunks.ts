/**
 * Voice-chunking subsystem for the translator modal. A voice chunk is one reading
 * unit: the host reads it aloud while the blue band highlights it. This module
 * splits speech text, groups rendered blocks into structural units (opener+body,
 * one list item at a time), and drives the highlight/scroll. Extracted from
 * translator.ts; pure DOM/text with no imports. Chunks stay under maxVoiceChunkChars
 * (< the host's split threshold) so progress indices stay aligned for highlighting.
 */

const maxVoiceChunkChars = 900;
let voiceScrollDebounceTimer: ReturnType<typeof setTimeout> | undefined;
// A voice chunk shorter than this is too small to read on its own. When it falls
// at the very end of an answer it's folded into the previous chunk instead of
// being spoken (and highlighted) as a lonely fragment.
const minVoiceChunkChars = 200;

export type TranslatorVoiceChunk = {
	text: string;
	elements: HTMLElement[];
};

function normalizeSpeechText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function splitLongSpeechSegment(segment: string): string[] {
	const chunks: string[] = [];
	let current = '';

	for (const part of segment.match(/\s+|\S+/g) ?? []) {
		if (part.length > maxVoiceChunkChars) {
			if (current.trim()) {
				chunks.push(current.trim());
			}
			current = '';
			for (let index = 0; index < part.length; index += maxVoiceChunkChars) {
				chunks.push(part.slice(index, index + maxVoiceChunkChars));
			}
			continue;
		}

		if (current && current.length + part.length > maxVoiceChunkChars) {
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

function splitSpeechText(text: string): string[] {
	const clean = normalizeSpeechText(text);
	if (!clean) {
		return [];
	}
	if (clean.length <= maxVoiceChunkChars) {
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

	const sentences = clean.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [clean];
	for (const sentence of sentences) {
		const piece = sentence.trim();
		if (!piece) {
			continue;
		}
		if (piece.length > maxVoiceChunkChars) {
			flush();
			chunks.push(...splitLongSpeechSegment(piece));
			continue;
		}

		const next = current ? `${current} ${piece}` : piece;
		if (next.length > maxVoiceChunkChars) {
			flush();
			current = piece;
		} else {
			current = next;
		}
	}

	flush();
	return chunks;
}

// ── Voice chunking ───────────────────────────────────────────────────
// A voice chunk is one reading unit: the blue band highlights it while the host
// reads it aloud. Rather than greedily packing ~900 chars across many sections
// (which made the first read swallow the whole dashboard + several paragraphs),
// chunks follow the answer's STRUCTURE: a run of "openers" (headings, emoji /
// score labels) attaches to the first "body" block that follows it — heading +
// a bit of context — and a second body starts a new chunk. So the first read is
// "title and a little context", and the highlight marks exactly that.

// Openers are short structural lines that introduce what comes next; they ride
// along with the following body instead of ending a chunk. Everything else
// (paragraphs, lists, tables, code, quotes) is a body that closes the unit.
const voiceOpenerSelector = '.md-h, .md-emoji-item, .md-score-item, .md-hr';
const isVoiceOpener = (element: HTMLElement): boolean => element.matches(voiceOpenerSelector);

// Groups rendered blocks into structural units. `add` returns a unit when the
// block it's given starts a new one (so the caller can stream it); `flush`
// yields the final, still-open unit.
export function createVoiceUnitAccumulator() {
	let current: TranslatorVoiceChunk | null = null;
	let currentHasBody = false;

	return {
		add(element: HTMLElement): TranslatorVoiceChunk | null {
			const text = normalizeSpeechText(element.textContent || '');
			if (!text) {
				return null; // rules and empty nodes carry no speech
			}
			const isBody = !isVoiceOpener(element);

			// The current unit already holds a body, so this block — opener or
			// body — belongs to the next one.
			if (current && currentHasBody) {
				const completed = current;
				current = { text, elements: [element] };
				currentHasBody = isBody;
				return completed;
			}

			if (current) {
				current.text = `${current.text}\n\n${text}`;
				current.elements.push(element);
				currentHasBody = currentHasBody || isBody;
			} else {
				current = { text, elements: [element] };
				currentHasBody = isBody;
			}
			return null;
		},
		flush(): TranslatorVoiceChunk | null {
			const completed = current;
			current = null;
			currentHasBody = false;
			return completed;
		},
	};
}

// A unit larger than a single chunk (a very long paragraph) is split into
// speakable pieces that all map back to the same element(s) — keeping every
// chunk under the host's split threshold so its progress index stays aligned
// with this list for highlighting.
export function unitToVoiceChunks(unit: TranslatorVoiceChunk): TranslatorVoiceChunk[] {
	if (unit.text.length <= maxVoiceChunkChars) {
		return [unit];
	}
	return splitSpeechText(unit.text).map((piece) => ({ text: piece, elements: unit.elements }));
}

function mergeVoiceUnits(first: TranslatorVoiceChunk, second: TranslatorVoiceChunk): TranslatorVoiceChunk {
	return {
		text: `${first.text}\n\n${second.text}`,
		elements: [...first.elements, ...second.elements],
	};
}

// Fold a too-small trailing unit into its predecessor so a little leftover text
// is read together with the block before it instead of on its own.
export function mergeTrailingVoiceUnit(units: TranslatorVoiceChunk[]): TranslatorVoiceChunk[] {
	if (units.length < 2) {
		return units;
	}
	const last = units[units.length - 1];
	if (last.text.length >= minVoiceChunkChars) {
		return units;
	}
	const previous = units[units.length - 2];
	return [...units.slice(0, -2), mergeVoiceUnits(previous, last)];
}

function makeChunkFromElements(elements: HTMLElement[]): TranslatorVoiceChunk {
	return {
		text: elements.map((el) => normalizeSpeechText(el.textContent || '')).join('\n\n'),
		elements,
	};
}

// The <li> children of a rendered list, or the list itself as a fallback if it
// somehow has none — so list voice units can be built one item at a time.
export function listItemsOf(list: HTMLElement): HTMLElement[] {
	const items = Array.from(list.children).filter(
		(child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI',
	);
	return items.length ? items : [list];
}

export function buildVoiceChunks(textEl: HTMLElement): TranslatorVoiceChunk[] {
	const renderedBlocks = Array.from(textEl.children).filter(
		(element): element is HTMLElement =>
			element instanceof HTMLElement && !element.classList.contains('translator-streaming'),
	);
	if (!renderedBlocks.length) {
		return mergeTrailingVoiceUnit([makeChunkFromElements([textEl])]).flatMap(unitToVoiceChunks);
	}

	// Walk blocks: non-list blocks go through the structural accumulator
	// (opener+body grouping), while each <li> of a <ul>/<ol> becomes its own
	// unit — so the reading band follows one list item at a time instead of
	// covering a whole batch of items.
	const units: TranslatorVoiceChunk[] = [];
	let nonListBlocks: HTMLElement[] = [];

	const flushNonList = () => {
		if (!nonListBlocks.length) {
			return;
		}
		const accumulator = createVoiceUnitAccumulator();
		for (const element of nonListBlocks) {
			const completed = accumulator.add(element);
			if (completed) {
				units.push(completed);
			}
		}
		const tail = accumulator.flush();
		if (tail) {
			units.push(tail);
		}
		nonListBlocks = [];
	};

	for (const block of renderedBlocks) {
		if (block.tagName === 'UL' || block.tagName === 'OL') {
			flushNonList();
			for (const item of listItemsOf(block)) {
				units.push(makeChunkFromElements([item]));
			}
		} else {
			nonListBlocks.push(block);
		}
	}
	flushNonList();

	return mergeTrailingVoiceUnit(units).flatMap(unitToVoiceChunks);
}

export function clearVoiceHighlights(chunks: TranslatorVoiceChunk[]): void {
	for (const chunk of chunks) {
		for (const element of chunk.elements) {
			element.classList.remove('is-voice-active', 'is-voice-start', 'is-voice-end');
		}
	}
}

export function setActiveVoiceChunk(chunks: TranslatorVoiceChunk[], index: number): void {
	clearVoiceHighlights(chunks);
	const chunk = chunks[index];
	if (!chunk) {
		return;
	}

	// Mark the chunk's blocks so CSS can fuse them into one cohesive reading band:
	// every block is active; the first opens the band (rounded top), the last
	// closes it (rounded bottom). A single-block chunk gets both.
	const lastIndex = chunk.elements.length - 1;
	chunk.elements.forEach((element, elementIndex) => {
		element.classList.add('is-voice-active');
		if (elementIndex === 0) {
			element.classList.add('is-voice-start');
		}
		if (elementIndex === lastIndex) {
			element.classList.add('is-voice-end');
		}
	});
	const target = chunk.elements[0];
	if (target) {
		// Debounce scrolling so rapid chunk advances don't fight the user's
		// own scrolling through the translation.
		if (voiceScrollDebounceTimer) {
			clearTimeout(voiceScrollDebounceTimer);
		}
		voiceScrollDebounceTimer = setTimeout(() => {
			voiceScrollDebounceTimer = undefined;
			target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}, 80);
	}
}

// Cancel any pending voice-scroll timer — called when a read is replaced or the
// panel unmounts, so a stale scroll can't fire into a fresh translation.
export function cancelVoiceScroll(): void {
	if (voiceScrollDebounceTimer) {
		clearTimeout(voiceScrollDebounceTimer);
		voiceScrollDebounceTimer = undefined;
	}
}
