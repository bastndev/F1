/**
 * Custom launch overlay for "Smart + Skills" (webview / DOM) — distinct from
 * panel-terminal/boot-skeleton.ts. Covers the panel with a loading animation
 * while the host builds the project graph + types the first prompt into the CLI,
 * then fades out (on the host's smart.dismiss) to reveal the live conversation.
 *
 * No "ready" text of its own — the readiness confirmation comes from the CLI's
 * own reply in the chat. Self-contained: injects its own <style> (the terminal
 * webview allows 'unsafe-inline' styles, like the tool modals).
 */

import skeletonCss from './smart-skeleton.css';

const STYLE_ID = 'smart-skeleton-styles';
const ROW_COUNT = 7;

const PHASES = [
	'Analyzing project structure',
	'Building context graph',
	'Indexing dependencies',
	'Applying rules',
	'Preparing workspace',
];

const ensureStyles = () => {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = skeletonCss;
	document.head.append(style);
};

const buildOverlay = (): HTMLDivElement => {
	const overlay = document.createElement('div');
	overlay.className = 'smart-overlay';

	const vignette = document.createElement('div');
	vignette.className = 'smart-vignette';

	const scan = document.createElement('div');
	scan.className = 'smart-scan';

	const inner = document.createElement('div');
	inner.className = 'smart-overlay-inner';

	const skeleton = document.createElement('div');
	skeleton.className = 'smart-skeleton';
	for (let i = 0; i < ROW_COUNT; i += 1) {
		const row = document.createElement('div');
		row.className = 'smart-skel-row';
		row.style.setProperty('--i', String(i));

		const accent = document.createElement('span');
		accent.className = 'smart-skel-accent';

		const lines = document.createElement('div');
		lines.className = 'smart-skel-lines';
		const long = document.createElement('span');
		long.className = 'smart-skel-bar w-long';
		const mid = document.createElement('span');
		mid.className = 'smart-skel-bar w-mid';
		lines.append(long, mid);

		row.append(accent, lines);
		skeleton.append(row);
	}

	const head = document.createElement('div');
	head.className = 'smart-overlay-head';
	const spark = document.createElement('span');
	spark.className = 'smart-overlay-spark';
	const sparkDot = document.createElement('span');
	sparkDot.className = 'smart-overlay-spark-dot';
	const sparkRing = document.createElement('span');
	sparkRing.className = 'smart-overlay-spark-ring';
	spark.append(sparkDot, sparkRing);
	const title = document.createElement('span');
	title.className = 'smart-overlay-title';
	title.textContent = 'Preparing your workspace — building project context + rules';
	const phase = document.createElement('span');
	phase.className = 'smart-overlay-phase';
	phase.textContent = PHASES[0];
	head.append(spark, title, phase);

	const status = document.createElement('div');
	status.className = 'smart-status';
	const statusLabel = document.createElement('span');
	statusLabel.className = 'smart-status-label';
	statusLabel.textContent = 'Indexing';
	const statusTrack = document.createElement('div');
	statusTrack.className = 'smart-status-track';
	const statusFill = document.createElement('div');
	statusFill.className = 'smart-status-fill';
	statusTrack.append(statusFill);
	const statusPct = document.createElement('span');
	statusPct.className = 'smart-status-pct';
	statusPct.textContent = '0%';
	status.append(statusLabel, statusTrack, statusPct);

	inner.append(skeleton, head, status);
	overlay.append(vignette, scan, inner);
	return overlay;
};

export type SmartSkeletonController = {
	/** Fade the overlay out and remove it. */
	dismiss: () => void;
};

export const createSmartSkeleton = (host: HTMLElement): SmartSkeletonController => {
	ensureStyles();
	const overlay = buildOverlay();
	host.append(overlay);

	let dismissed = false;

	// Cycle phase text
	let phaseIdx = 0;
	const phaseEl = overlay.querySelector('.smart-overlay-phase');
	const phaseInterval = setInterval(() => {
		if (dismissed) {
			clearInterval(phaseInterval);
			return;
		}
		phaseIdx = (phaseIdx + 1) % PHASES.length;
		if (phaseEl) {
			phaseEl.textContent = PHASES[phaseIdx];
		}
	}, 3500);

	// Animate status bar
	const status = overlay.querySelector('.smart-status') as HTMLElement | null;
	const statusLabel = overlay.querySelector('.smart-status-label') as HTMLElement | null;
	const fill = overlay.querySelector('.smart-status-fill') as HTMLElement | null;
	const pct = overlay.querySelector('.smart-status-pct') as HTMLElement | null;

	// Ease toward a ceiling instead of crawling into a hard wall: each tick advances
	// a fraction of the remaining distance, so the bar decelerates smoothly and never
	// truly stalls (the small constant keeps it alive on very large projects).
	const START = 4;
	const CEILING = 92;
	let progress = START;
	const renderProgress = () => {
		if (fill) {
			fill.style.width = `${progress}%`;
		}
		if (pct) {
			pct.textContent = `${Math.round(progress)}%`;
		}
	};
	renderProgress();

	// The bar is invisible (opacity 0) until its fade-in fires at ~3.5s. Start the
	// crawl only when it actually appears, so the user watches it climb from ~START
	// instead of popping in already half-full.
	let statusInterval = 0;
	let crawlStarted = false;
	const startCrawl = () => {
		if (crawlStarted || dismissed) {
			return;
		}
		crawlStarted = true;
		statusInterval = window.setInterval(() => {
			if (dismissed) {
				clearInterval(statusInterval);
				return;
			}
			progress = Math.min(CEILING, progress + (CEILING - progress) * 0.08 + 0.15);
			renderProgress();
		}, 400);
	};

	const prefersReducedMotion =
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (prefersReducedMotion || !status) {
		// No fade-in to wait for — the bar is shown immediately.
		startCrawl();
	} else {
		const onAppear = (ev: AnimationEvent) => {
			if (ev.animationName === 'smart-head-in') {
				status.removeEventListener('animationstart', onAppear);
				startCrawl();
			}
		};
		status.addEventListener('animationstart', onAppear);
		// Fallback in case the event never fires.
		window.setTimeout(startCrawl, 3800);
	}

	return {
		dismiss: () => {
			if (dismissed) {
				return;
			}
			dismissed = true;
			clearInterval(phaseInterval);
			clearInterval(statusInterval);

			// Completion sweep: ease the fill to 100% (see .is-complete in the CSS)
			// instead of snapping, so a fast small-project dismiss reads as a finish
			// rather than a one-frame teleport. Fade only after the sweep settles.
			const SWEEP_MS = 480;
			if (status) {
				status.classList.add('is-complete');
			}
			if (statusLabel) {
				statusLabel.textContent = 'Ready';
			}
			if (fill) {
				fill.style.width = '100%';
			}
			if (pct) {
				const pctEl = pct;
				const from = progress;
				const start = performance.now();
				const tick = (now: number) => {
					const t = Math.min(1, (now - start) / SWEEP_MS);
					const eased = 1 - Math.pow(1 - t, 3);
					pctEl.textContent = `${Math.round(from + (100 - from) * eased)}%`;
					if (t < 1) {
						requestAnimationFrame(tick);
					}
				};
				requestAnimationFrame(tick);
			}

			window.setTimeout(() => {
				overlay.classList.add('is-leaving');
				const remove = () => overlay.remove();
				overlay.addEventListener('transitionend', remove, { once: true });
				// Fallback in case transitionend doesn't fire.
				window.setTimeout(remove, 700);
			}, SWEEP_MS);
		}
	};
};
