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

	const inner = document.createElement('div');
	inner.className = 'smart-overlay-inner';

	const head = document.createElement('div');
	head.className = 'smart-overlay-head';
	const spark = document.createElement('span');
	spark.className = 'smart-overlay-spark';
	const title = document.createElement('span');
	title.className = 'smart-overlay-title';
	title.textContent = 'Preparing your workspace — building project context + rules';
	head.append(spark, title);

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

	inner.append(head, skeleton);
	overlay.append(inner);
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

	return {
		dismiss: () => {
			if (dismissed) {
				return;
			}
			dismissed = true;
			overlay.classList.add('is-leaving');
			const remove = () => overlay.remove();
			overlay.addEventListener('transitionend', remove, { once: true });
			// Fallback in case transitionend doesn't fire.
			setTimeout(remove, 700);
		}
	};
};
