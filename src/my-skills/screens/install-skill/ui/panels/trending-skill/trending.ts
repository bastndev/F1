import { initTrendingFlamePanel, showTrendingFlamePanel } from './flame/flame';
import { initTrending24hPanel, showTrending24hPanel } from './24h/24h';

type TrendingMode = 'flame' | '24h';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

export function initTrendingPanel(vscodeApi: VsCodeApi): void {
	const trendingFilter = document.getElementById('install-filter-trending') as HTMLButtonElement | null;
	const modeSlot = trendingFilter?.querySelector<HTMLElement>('.install-filter-mode-slot');
	const flameIndicator = document.querySelector<HTMLElement>('[data-trending-mode-indicator="flame"]');
	const realtimeIndicator = document.querySelector<HTMLElement>('[data-trending-mode-indicator="24h"]');
	const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-trending-mode-panel]'));

	if (!trendingFilter || !modeSlot || !flameIndicator || !realtimeIndicator || panels.length === 0) {
		return;
	}

	initTrendingFlamePanel(vscodeApi);
	initTrending24hPanel(vscodeApi);

	let mode: TrendingMode = '24h';
	let hasAppliedMode = false;
	let switchAnimationTimer: number | undefined;

	const applyMode = (nextMode: TrendingMode) => {
		const previousMode = mode;
		const shouldAnimateSwitch = hasAppliedMode && previousMode !== nextMode;
		mode = nextMode;
		flameIndicator.setAttribute('aria-hidden', String(mode !== 'flame'));
		realtimeIndicator.setAttribute('aria-hidden', String(mode !== '24h'));
		trendingFilter.dataset.trendingMode = mode;
		trendingFilter.dataset.previousTrendingMode = previousMode;

		if (switchAnimationTimer !== undefined) {
			window.clearTimeout(switchAnimationTimer);
			switchAnimationTimer = undefined;
		}

		trendingFilter.classList.toggle('is-switching', shouldAnimateSwitch);
		if (shouldAnimateSwitch) {
			switchAnimationTimer = window.setTimeout(() => {
				trendingFilter.classList.remove('is-switching');
				switchAnimationTimer = undefined;
			}, 460);
		}

		panels.forEach(panel => {
			const isActive = panel.dataset.trendingModePanel === mode;
			panel.hidden = !isActive;
			panel.setAttribute('aria-hidden', String(!isActive));
		});

		if (mode === '24h') {
			showTrending24hPanel();
		} else {
			showTrendingFlamePanel();
		}

		hasAppliedMode = true;
	};

	trendingFilter.addEventListener('click', event => {
		const clickedIndicator = (event.target as HTMLElement | null)?.closest('[data-trending-mode-indicator]');
		if (!clickedIndicator) {
			return;
		}

		trendingFilter.classList.add('is-preview-locked');
		applyMode(mode === '24h' ? 'flame' : '24h');
	});

	modeSlot.addEventListener('mouseleave', () => {
		trendingFilter.classList.remove('is-preview-locked');
	});

	window.addEventListener('installSkills.openFlame', () => {
		trendingFilter.classList.add('is-preview-locked');
		applyMode('flame');
		window.setTimeout(() => {
			trendingFilter.classList.remove('is-preview-locked');
		}, 180);
	});

	applyMode(mode);
}
