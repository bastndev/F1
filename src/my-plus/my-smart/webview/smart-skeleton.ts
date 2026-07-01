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
	const fill = overlay.querySelector('.smart-status-fill') as HTMLElement | null;
	const pct = overlay.querySelector('.smart-status-pct') as HTMLElement | null;
	let progress = 0;
	const statusInterval = setInterval(() => {
		if (dismissed) {
			clearInterval(statusInterval);
			return;
		}
		// Slow crawl: reaches ~85% by the time it would typically dismiss
		progress += Math.random() * 3 + 0.5;
		if (progress > 85) {
			progress = 85;
		}
		if (fill) {
			fill.style.width = `${progress}%`;
		}
		if (pct) {
			pct.textContent = `${Math.round(progress)}%`;
		}
	}, 800);

	return {
		dismiss: () => {
			if (dismissed) {
				return;
			}
			dismissed = true;
			clearInterval(phaseInterval);
			clearInterval(statusInterval);

			// Snap to 100% before fading
			if (fill) {
				fill.style.width = '100%';
			}
			if (pct) {
				pct.textContent = '100%';
			}

			overlay.classList.add('is-leaving');
			const remove = () => overlay.remove();
			overlay.addEventListener('transitionend', remove, { once: true });
			// Fallback in case transitionend doesn't fire.
			setTimeout(remove, 700);
		}
	};
};
