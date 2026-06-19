/**
 * My Skills: Create Skill Support / Tutorial
 *
 * Interactivity for the non-technical tutorial panel.
 *
 * TODO: Video tutorials — future implementation.
 */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canTrackPointer = window.matchMedia('(pointer: fine)');

// ── Water ripple + liquid glass effect ──────────────────────────────
const hero = document.querySelector<HTMLElement>('.support-author-hero');

if (hero && canTrackPointer.matches && !prefersReducedMotion.matches) {
	const canvas = document.createElement('canvas');
	canvas.className = 'hero-water-canvas';
	canvas.setAttribute('aria-hidden', 'true');
	hero.prepend(canvas);

	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) {
		throw new Error('No canvas context');
	}

	let width = 0;
	let height = 0;
	let halfWidth = 0;
	let halfHeight = 0;
	let bufferSize = 0;

	// Wave simulation buffers
	let buffer1: Int16Array;
	let buffer2: Int16Array;

	// Background image data (the "liquid glass" base)
	let bgData: ImageData;

	const DAMPING = 0.965; // How fast waves fade (water viscosity)
	const RIPPLE_RADIUS = 3;
	const RIPPLE_STRENGTH = 800; // Drop intensity

	function resize() {
		const rect = hero!.getBoundingClientRect();
		width = Math.floor(rect.width);
		height = Math.floor(rect.height);

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

		halfWidth = width >> 1;
		halfHeight = height >> 1;
		bufferSize = width * height;
		buffer1 = new Int16Array(bufferSize);
		buffer2 = new Int16Array(bufferSize);

		// Generate liquid glass background
		generateBackground();
	}

	function generateBackground() {
		// Hero tint — fixed yellow for CLI Hub (instead of the theme's blue accent).
		const accent = '#e2b719';
		const fg = getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim() || '#cccccc';

		// Create temp canvas to draw gradient
		const temp = document.createElement('canvas');
		temp.width = width;
		temp.height = height;
		const tCtx = temp.getContext('2d')!;

		// Glass base: radial glow — intense on RIGHT, fading to dark LEFT
		const grd = tCtx.createRadialGradient(
			width * 0.25, height * 0.35, 0,
			width * 0.75, height * 0.65, Math.max(width, height)
		);
		grd.addColorStop(0, hexToRgba(accent, 0.12));
		grd.addColorStop(0.5, hexToRgba(accent, 0.05));
		grd.addColorStop(1, hexToRgba('#000000', 0.6));

		tCtx.fillStyle = grd;
		tCtx.fillRect(0, 0, width, height);

		// Glass edge specular highlight (top-right now)
		const edge = tCtx.createLinearGradient(width, 0, width * 0.5, height * 0.5);
		edge.addColorStop(0, hexToRgba(fg, 0.14));
		edge.addColorStop(1, hexToRgba(fg, 0));
		tCtx.fillStyle = edge;
		tCtx.fillRect(0, 0, width, height);

		// Subtle noise texture for glass feel
		const imgData = tCtx.getImageData(0, 0, width, height);
		const data = imgData.data;
		for (let i = 0; i < data.length; i += 4) {
			const noise = (Math.random() - 0.5) * 6;
			data[i] += noise;
			data[i + 1] += noise;
			data[i + 2] += noise;
		}

		bgData = imgData;
	}

	function hexToRgba(hex: string, alpha: number): string {
		// Handle #rgb, #rrggbb, or rgb() / rgba() strings
		if (hex.startsWith('rgb')) {
			return hex.replace(')', `, ${alpha})`).replace('rgb(', 'rgba(');
		}
		let r = 0, g = 0, b = 0;
		if (hex.length === 4) {
			r = parseInt(hex[1] + hex[1], 16);
			g = parseInt(hex[2] + hex[2], 16);
			b = parseInt(hex[3] + hex[3], 16);
		} else if (hex.length >= 7) {
			r = parseInt(hex.slice(1, 3), 16);
			g = parseInt(hex.slice(3, 5), 16);
			b = parseInt(hex.slice(5, 7), 16);
		}
		return `rgba(${r},${g},${b},${alpha})`;
	}

	function dropRipple(x: number, y: number, strength: number) {
		if (x < RIPPLE_RADIUS || x >= width - RIPPLE_RADIUS || y < RIPPLE_RADIUS || y >= height - RIPPLE_RADIUS) {
			return;
		}
		const idx = y * width + x;
		buffer1[idx] += strength;
		// Also push neighbors for smoother drop
		buffer1[idx - 1] += strength * 0.5;
		buffer1[idx + 1] += strength * 0.5;
		buffer1[idx - width] += strength * 0.5;
		buffer1[idx + width] += strength * 0.5;
	}

	let lastMouseX = -1;
	let lastMouseY = -1;

	hero.addEventListener('pointermove', event => {
		const rect = hero!.getBoundingClientRect();
		const x = Math.floor(event.clientX - rect.left);
		const y = Math.floor(event.clientY - rect.top);

		// Only create ripple if moved enough
		if (Math.abs(x - lastMouseX) > 3 || Math.abs(y - lastMouseY) > 3) {
			dropRipple(x, y, RIPPLE_STRENGTH);
			lastMouseX = x;
			lastMouseY = y;
		}
	}, { passive: true });

	hero.addEventListener('pointerenter', event => {
		const rect = hero!.getBoundingClientRect();
		lastMouseX = Math.floor(event.clientX - rect.left);
		lastMouseY = Math.floor(event.clientY - rect.top);
		dropRipple(lastMouseX, lastMouseY, RIPPLE_STRENGTH * 1.5);
	});

	function processRipples() {
		// Swap buffers
		const temp = buffer1;
		buffer1 = buffer2;
		buffer2 = temp;

		const w = width;
		const h = height;
		const len = w * h;

		// Skip edges
		for (let y = 1; y < h - 1; y++) {
			const yOffset = y * w;
			for (let x = 1; x < w - 1; x++) {
				const idx = yOffset + x;
				// Wave propagation: average of neighbors minus current
				let val = (
					buffer1[idx - 1] +
					buffer1[idx + 1] +
					buffer1[idx - w] +
					buffer1[idx + w]
				) >> 1;
				val -= buffer2[idx];
				val *= DAMPING;
				buffer2[idx] = val;
			}
		}
	}

	function render() {
		if (!bgData) {
			return;
		}

		const output = ctx!.createImageData(width, height);
		const outData = output.data;
		const bg = bgData.data;
		const w = width;
		const h = height;

		for (let y = 0; y < h; y++) {
			const yOffset = y * w;
			for (let x = 0; x < w; x++) {
				const idx = yOffset + x;
				const pixelIdx = idx * 4;

				if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
					// Edge pixels: copy background
					outData[pixelIdx] = bg[pixelIdx];
					outData[pixelIdx + 1] = bg[pixelIdx + 1];
					outData[pixelIdx + 2] = bg[pixelIdx + 2];
					outData[pixelIdx + 3] = bg[pixelIdx + 3];
					continue;
				}

				// Calculate refraction offset based on wave slope
				const xOffset = buffer2[idx - 1] - buffer2[idx + 1];
				const yOffset2 = buffer2[idx - w] - buffer2[idx + w];

				// Distortion strength
				const distortX = x >> 0;
				const distortY = y >> 0;
				let sampleX = distortX + (xOffset >> 4);
				let sampleY = distortY + (yOffset2 >> 4);

				// Clamp
				if (sampleX < 0) { sampleX = 0; }
				if (sampleX >= w) { sampleX = w - 1; }
				if (sampleY < 0) { sampleY = 0; }
				if (sampleY >= h) { sampleY = h - 1; }

				const sampleIdx = (sampleY * w + sampleX) * 4;

				// Specular highlight on wave crests
				const shading = xOffset >> 0;
				const specular = shading > 0 ? shading * 1.2 : 0;

				outData[pixelIdx] = Math.min(255, bg[sampleIdx] + specular);
				outData[pixelIdx + 1] = Math.min(255, bg[sampleIdx + 1] + specular);
				outData[pixelIdx + 2] = Math.min(255, bg[sampleIdx + 2] + specular);
				outData[pixelIdx + 3] = 255;
			}
		}

		ctx!.putImageData(output, 0, 0);
	}

	function loop() {
		processRipples();
		render();
		requestAnimationFrame(loop);
	}

	resize();
	loop();

	window.addEventListener('resize', () => {
		resize();
	});
}

// ── Smooth-scroll anchor links ──────────────────────────────────────
const anchorLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));

anchorLinks.forEach(link => {
	link.addEventListener('click', event => {
		const href = link.getAttribute('href');
		if (!href || href.length <= 1) {
			return;
		}

		const target = document.querySelector<HTMLElement>(href);
		if (!target) {
			return;
		}

		event.preventDefault();
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
		target.focus({ preventScroll: true });
	});
});

// ── FAQ accordion ───────────────────────────────────────────────────
const faqItems = Array.from(document.querySelectorAll<HTMLDetailsElement>('.support-faq-item'));

faqItems.forEach(item => {
	item.addEventListener('toggle', () => {
		const summary = item.querySelector('summary');
		const label = summary?.textContent?.trim() ?? 'FAQ item';
		// Placeholder for future telemetry
		// console.log(`[MySkills Support] FAQ toggled: ${label} — ${item.open ? 'open' : 'closed'}`);
	});
});

// ── Video card placeholders ─────────────────────────────────────────
const videoCards = Array.from(document.querySelectorAll<HTMLDivElement>('.support-video-card'));

videoCards.forEach(card => {
	card.addEventListener('click', () => {
		// Future: openExternal(videoUrl)
		card.style.transform = 'scale(0.98)';
		window.setTimeout(() => {
			card.style.transform = '';
		}, 120);
	});
});
