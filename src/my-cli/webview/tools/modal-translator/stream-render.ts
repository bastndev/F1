/**
 * Streamed-translation rendering for the Translator modal: the staged-block
 * reveal (blocks buffer briefly, then crossfade in as a cohesive chunk), the
 * smooth body-height grow that follows the content, and the loading/skeleton
 * DOM builders. Extracted from translator.ts's performTranslation; one
 * createStreamRenderer per translation run, gated by the caller's generation
 * check so a superseded run can never touch the DOM.
 */
import { renderMarkdownLite } from './markdown-lite';

export interface StreamRenderDeps {
	textEl: HTMLElement;
	bodyEl: HTMLElement | null;
	modalEl: HTMLElement;
	/** Still the latest run and the panel is mounted — stale runs must not touch state/DOM. */
	isCurrent(): boolean;
	/** Panel still mounted (a newer run may exist) — gates only the RAF'd height write. */
	isMounted(): boolean;
	/** First real content landed: the field switched to rendered mode. */
	onStreamStart(): void;
	/** Rendered blocks were inserted — e.g. feed them to the voice pipeline. */
	onBlocksInserted(elements: HTMLElement[]): void;
}

export type StreamRenderer = ReturnType<typeof createStreamRenderer>;

// Instead of revealing every translated block the instant it lands, blocks are
// staged in a short buffer and flushed as a cohesive chunk. The skeleton stays
// visible while buffering, then a batch of blocks crossfades in with a
// staggered reveal — a much cleaner, premium feel than content dribbling in.
// Keep the batch small so blocks arrive a couple at a time and each gets room
// to settle, rather than four popping in at once (which read as "hard").
export const createStreamRenderer = (deps: StreamRenderDeps) => {
	const maxStagedBlocks = 2;
	const stageRevealDelayMs = 420;

	// Accumulated result (for the Copy button + the exact-selection cache).
	const renderedParts: string[] = [];
	const copyParts: string[] = [];
	let streamStarted = false;

	// The body height is animated to fit the content as blocks land, so the
	// modal grows smoothly with the translation instead of sitting skeleton-
	// sized until the very end. maxBodyHeight caps the grow at the panel's
	// spare room; past it the body scrolls (restored when the grow settles).
	let maxBodyHeight = Number.POSITIVE_INFINITY;
	let growScheduled = false;

	const stagedBlocks: { markdown: string; copy: string }[] = [];
	let stageFlushTimer: ReturnType<typeof setTimeout> | undefined;

	const applyBodyHeight = () => {
		if (deps.bodyEl) {
			deps.bodyEl.style.height = `${Math.min(deps.bodyEl.scrollHeight, maxBodyHeight)}px`;
		}
	};

	// Coalesce the per-block height writes into one per frame — several short
	// blocks (scores, labels) can land in the same tick.
	const scheduleGrow = () => {
		if (growScheduled) {
			return;
		}
		growScheduled = true;
		requestAnimationFrame(() => {
			growScheduled = false;
			if (deps.isMounted()) {
				applyBodyHeight();
			}
		});
	};

	// First block: drop the skeleton, switch the field to rendered mode, pin a
	// small "more on the way" indicator that subsequent blocks insert in front
	// of, and arm the smooth grow (measuring the panel's spare room first).
	const beginStream = () => {
		streamStarted = true;
		deps.textEl.replaceChildren();
		deps.textEl.classList.remove('placeholder');
		deps.textEl.classList.add('is-rendered');
		deps.onStreamStart();
		deps.textEl.append(buildStreamIndicator());
		if (deps.bodyEl) {
			const available = deps.modalEl.parentElement?.clientHeight ?? 0;
			const chrome = deps.modalEl.offsetHeight - deps.bodyEl.offsetHeight;
			maxBodyHeight = available > 0 ? Math.max(0, available - chrome) : Number.POSITIVE_INFINITY;
			deps.bodyEl.style.maxHeight = `${maxBodyHeight}px`;
			deps.bodyEl.classList.add('is-streaming-grow');
		}
	};

	const flushStagedBlocks = () => {
		if (stageFlushTimer) {
			clearTimeout(stageFlushTimer);
			stageFlushTimer = undefined;
		}
		if (!stagedBlocks.length) {
			return;
		}
		if (!deps.isCurrent()) {
			stagedBlocks.length = 0;
			return;
		}
		if (!streamStarted) {
			beginStream();
		}
		if (!deps.isCurrent()) {
			stagedBlocks.length = 0;
			return;
		}

		const blocksToEmit = stagedBlocks.splice(0);
		const indicator = deps.textEl.querySelector('.translator-streaming');
		const fragment = document.createDocumentFragment();
		const insertedElements: HTMLElement[] = [];
		let staggerIndex = 0;

		for (const { markdown, copy } of blocksToEmit) {
			renderedParts.push(markdown);
			copyParts.push(copy);
			const template = document.createElement('template');
			template.innerHTML = renderMarkdownLite(markdown);
			for (const node of Array.from(template.content.childNodes)) {
				if (node instanceof HTMLElement) {
					node.classList.add('is-block-in');
					node.style.animationDelay = `${staggerIndex * 110}ms`;
					node.addEventListener('animationend', () => {
						node.classList.remove('is-block-in');
						node.style.animationDelay = '';
					}, { once: true });
					insertedElements.push(node);
					staggerIndex += 1;
				}
				fragment.appendChild(node);
			}
		}
		deps.textEl.insertBefore(fragment, indicator);
		scheduleGrow();
		deps.onBlocksInserted(insertedElements);
	};

	const stageBlock = (markdown: string, copy: string) => {
		if (!deps.isCurrent()) {
			return;
		}
		stagedBlocks.push({ markdown, copy });
		if (stagedBlocks.length >= maxStagedBlocks) {
			flushStagedBlocks();
		} else if (!stageFlushTimer) {
			stageFlushTimer = setTimeout(() => {
				stageFlushTimer = undefined;
				flushStagedBlocks();
			}, stageRevealDelayMs);
		}
	};

	return {
		stageBlock,
		/** Flush any staged blocks now (end of stream, or surfacing partials on error). */
		flush: flushStagedBlocks,
		hasStarted: () => streamStarted,
		hasRenderedBlocks: () => renderedParts.length > 0,
		renderedMarkdown: () => renderedParts.join('\n\n'),
		copyText: () => copyParts.join('\n\n'),
		/** Retire the "more on the way" indicator once the stream is done. */
		removeIndicator: () => {
			deps.textEl.querySelector('.translator-streaming')?.remove();
		},
		/** Grow one last time to the final content height. */
		applyBodyHeight,
		/** Drop a pending debounced flush (run superseded or settling). */
		cancelPendingFlush: () => {
			if (stageFlushTimer) {
				clearTimeout(stageFlushTimer);
				stageFlushTimer = undefined;
			}
		},
	};
};

// How long to wait before dropping the body's explicit height after a grow.
// Must outlast the .is-streaming-grow height transition — read it live from
// the element so CSS can change the duration without silently breaking this
// (a settle that fires mid-transition snaps the modal). +40ms of slack covers
// frame scheduling; reduced motion (transition: none) settles almost at once.
export function getGrowSettleMs(body: HTMLElement): number {
	const seconds = Number.parseFloat(getComputedStyle(body).transitionDuration) || 0;
	return seconds * 1000 + 40;
}

// The skeleton's typing dots (› ···) — shared tail of every loading state.
function buildTypingDots(): HTMLElement {
	const typing = document.createElement('div');
	typing.className = 't-skel-typing';

	const sym = document.createElement('span');
	sym.className = 't-skel-sym';
	sym.textContent = '›';
	typing.append(sym);

	const dots = document.createElement('span');
	dots.className = 't-skel-dots';
	for (let i = 0; i < 3; i += 1) {
		const dot = document.createElement('span');
		dot.className = 't-skel-dot';
		dots.append(dot);
	}
	typing.append(dots);

	return typing;
}

// Compact "still translating" affordance below the streamed blocks — the
// skeleton's typing dots (› ···). Rendered with zero layout height (absolute,
// in the body's bottom padding; see .translator-streaming) so removing it at
// the end of the stream never shrinks the modal.
function buildStreamIndicator(): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-streaming';
	wrap.setAttribute('aria-hidden', 'true');
	wrap.append(buildTypingDots());

	return wrap;
}

// Minimal inline loading indicator for short selections — just the typing
// dots (› ···) with no skeleton box, no shimmer lines, no scan beam. Sits
// where the result will appear, barely taller than the text itself, so a
// one-line selection gets a loading state with no empty space and no jump.
export function buildInlineLoading(): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-inline-loading';
	wrap.setAttribute('aria-hidden', 'true');
	wrap.append(buildTypingDots());

	return wrap;
}

export function buildSkeleton(availableHeight: number, lineHint?: number): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-skeleton';
	wrap.setAttribute('aria-hidden', 'true');

	// The skeleton sizes to the locked loading box so the scan beam covers it,
	// but the shimmer lines + typing dots pack tightly at the top (see CSS:
	// .t-skel-lines is flex: 0 0 auto) — so a small selection gets a minimal
	// cluster with no gap, not a tall stretched placeholder. The body keeps its
	// resting 16px top/bottom padding through loading (so the result never
	// shifts when it lands), so subtract 32.
	const contentHeight = Math.max(26, Math.min(200, availableHeight - 32));
	wrap.style.height = `${contentHeight}px`;

	const scan = document.createElement('div');
	scan.className = 't-skel-scan';
	wrap.append(scan);

	const lines = document.createElement('div');
	lines.className = 't-skel-lines';
	wrap.append(lines);

	// Scale the shimmer line count to the source text so a one-line selection
	// gets a minimal skeleton (a single line + the typing dots) and a long
	// selection gets a fuller one. The hint is clamped, then capped by what the
	// box can hold.
	const pattern = ['full', 'full', 'long', 'full', 'med', 'full', 'long'];
	const hinted = lineHint && lineHint > 0 ? Math.min(8, lineHint) : 2;
	const lineCount = Math.min(hinted, Math.max(1, Math.floor((contentHeight - 22) / 16)));

	for (let i = 0; i < lineCount; i += 1) {
		const line = document.createElement('div');
		line.className = `t-skel-line ${pattern[i % pattern.length]}`;
		if (i > 0 && i % 3 === 0) {
			line.classList.add('t-skel-gap');
		}
		lines.append(line);
	}

	wrap.append(buildTypingDots());

	return wrap;
}
