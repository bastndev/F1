/**
 * Search-mode "bloom" canvas animation: a dot wave that sweeps the create
 * surface when search mode is entered and loops while the user keeps typing.
 * Extracted from shell.ts as a createSearchBloom(deps) factory; owns its
 * canvas, RAF loop, dot grid cache and the visibility observer that pauses
 * the wave while the surface is scrolled out of view. Honors
 * prefers-reduced-motion by never starting.
 */
type SearchBloomDot = { x: number; y: number; normDist: number };
type SearchBloomDotGrid = { width: number; height: number; dots: SearchBloomDot[] };

const searchBloomDotSpacing = 12;
const searchBloomDotRadius = 1;
const searchBloomDurationMs = 1950;
const searchBloomBand = 0.28;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export interface SearchBloomDeps {
	/** The create surface the canvas overlays. */
	surface: HTMLElement;
	/** Whether the search input currently holds text (the typing loop stops without it). */
	hasInputValue(): boolean;
}

export type SearchBloom = ReturnType<typeof createSearchBloom>;

export const createSearchBloom = (deps: SearchBloomDeps) => {
	let bloomRaf: number | undefined;
	let bloomCanvas: HTMLCanvasElement | undefined;
	let bloomPromise: Promise<void> | undefined;
	let resolveBloom: (() => void) | undefined;
	let shouldRepeatSearchBloom = false;
	let isSearchBloomLoopRunning = false;
	let searchBloomDotGrid: SearchBloomDotGrid | undefined;

	/** Returns the [r, g, b] of the search accent. */
	function getSearchAccentRgb(): [number, number, number] {
		return [46, 160, 67]; // #2ea043
	}

	function stopBloom() {
		if (bloomRaf !== undefined) {
			cancelAnimationFrame(bloomRaf);
			bloomRaf = undefined;
		}

		bloomCanvas?.remove();
		bloomCanvas = undefined;
		resolveBloom?.();
		resolveBloom = undefined;
		bloomPromise = undefined;
	}

	function completeBloom() {
		bloomCanvas?.remove();
		bloomCanvas = undefined;
		bloomRaf = undefined;
		resolveBloom?.();
		resolveBloom = undefined;
		bloomPromise = undefined;
	}

	async function playSearchTypingBloomLoop() {
		if (isSearchBloomLoopRunning) {
			return;
		}

		isSearchBloomLoopRunning = true;
		try {
			while (shouldRepeatSearchBloom && deps.hasInputValue()) {
				if (bloomPromise) {
					await bloomPromise;
				} else {
					await playEnterTransition();
				}
			}
		} finally {
			isSearchBloomLoopRunning = false;
		}
	}

	function requestTypingBloom() {
		if (!deps.hasInputValue() || prefersReducedMotion.matches) {
			shouldRepeatSearchBloom = false;
			return;
		}

		shouldRepeatSearchBloom = true;

		void playSearchTypingBloomLoop();
	}

	/** Stop re-arming the typing loop (mode left search / a search was submitted). */
	function stopRepeating() {
		shouldRepeatSearchBloom = false;
	}

	function playEnterTransition(): Promise<void> {
		if (prefersReducedMotion.matches) {
			return Promise.resolve();
		}

		stopBloom();
		bloomPromise = new Promise(resolve => {
			resolveBloom = resolve;
		});

		// Canvas covers the full surface, sits behind content (z-index 0)
		const canvas = document.createElement('canvas');
		canvas.className = 'create-search-bloom-canvas';
		canvas.style.cssText = [
			'position:absolute',
			'inset:0',
			'width:100%',
			'height:100%',
			'pointer-events:none',
			'z-index:0',
		].join(';');
		deps.surface.appendChild(canvas);
		bloomCanvas = canvas;

		const W = deps.surface.offsetWidth;
		const H = deps.surface.offsetHeight;
		canvas.width = W;
		canvas.height = H;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			stopBloom();
			return Promise.resolve();
		}

		const [r, g, b] = getSearchAccentRgb();
		const dots = getSearchBloomDots(W, H);

		const startTime = performance.now();

		function frame(now: number) {
			const p = Math.min((now - startTime) / searchBloomDurationMs, 1);
			ctx!.clearRect(0, 0, W, H);

			// Wave front advances with a sqrt ease (fast start, slows near end)
			const waveFront = Math.pow(p, 0.5);
			const waveTrail = Math.max(0, waveFront - searchBloomBand);

			for (const d of dots) {
				const { normDist } = d;

				// Not yet reached by wave front → invisible
				if (waveFront < normDist) {
					continue;
				}

				let alpha: number;

				if (waveTrail < normDist) {
					// Inside the active wave band: peak at band center using a sine arch
					const bandPos = (waveFront - normDist) / searchBloomBand;
					alpha = Math.sin(bandPos * Math.PI) * 0.82;
				} else {
					// Behind the trail: fading echo
					const trailFade = (waveTrail - normDist) / (waveTrail + 0.001);
					alpha = 0.18 * (1 - Math.min(trailFade, 1));
				}

				// Global fade-out as animation progresses
				alpha *= (1 - p * 0.62);

				if (alpha < 0.01) {
					continue;
				}

				ctx!.beginPath();
				ctx!.arc(d.x, d.y, searchBloomDotRadius, 0, Math.PI * 2);
				ctx!.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
				ctx!.fill();
			}

			if (p < 1) {
				bloomRaf = requestAnimationFrame(frame);
			} else {
				completeBloom();
			}
		}

		bloomRaf = requestAnimationFrame(frame);
		return bloomPromise;
	}

	function getSearchBloomDots(width: number, height: number): SearchBloomDot[] {
		if (searchBloomDotGrid?.width === width && searchBloomDotGrid.height === height) {
			return searchBloomDotGrid.dots;
		}

		const originX = width / 2;
		const originY = height + 12;
		const maxDist = Math.hypot(width, height + 12);
		const offX = (width % searchBloomDotSpacing) / 2;
		const offY = (height % searchBloomDotSpacing) / 2;
		const dots: SearchBloomDot[] = [];

		for (let x = offX; x < width; x += searchBloomDotSpacing) {
			for (let y = offY; y < height; y += searchBloomDotSpacing) {
				dots.push({
					x,
					y,
					normDist: Math.hypot(x - originX, y - originY) / maxDist,
				});
			}
		}

		searchBloomDotGrid = { width, height, dots };
		return dots;
	}

	// Pause the wave while the surface is scrolled out of view; resume the
	// typing loop when it comes back with text still in the search input.
	let isSurfaceVisible = true;
	const observer = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			isSurfaceVisible = entry.isIntersecting;
			if (!isSurfaceVisible) {
				if (bloomRaf !== undefined) {
					stopBloom();
				}
			} else if (shouldRepeatSearchBloom && deps.hasInputValue()) {
				requestTypingBloom();
			}
		}
	});
	observer.observe(deps.surface);

	return {
		requestTypingBloom,
		playEnterTransition,
		stopRepeating
	};
};
