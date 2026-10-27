import type { HostToWebviewMessage } from '../../../shared/protocol';
import { KoiRenderer, type Rgb } from './renderer';
import { World, type Box } from './world';

const frameInterval = 1000 / 30;
const simulationStep = 1 / 60;
const maxSteps = 4;

/** Owns only the launcher canvas; replacing the webview with a terminal destroys it. */
class LauncherBackground {
	private readonly world = new World();
	private readonly renderer: KoiRenderer;
	private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	private readonly resizeObserver = new ResizeObserver(() => this.invalidateLayout());
	private readonly themeObserver = new MutationObserver(() => this.updateTheme());
	private raf = 0;
	private previousFrame = 0;
	private previousTick = 0;
	private accumulator = 0;
	private layoutDirty = true;
	private hostVisible = true;
	private highContrast = false;
	private disposed = false;
	private width = 0;
	private height = 0;
	private dpr = 0;
	private lastRippleTime = -Infinity;

	constructor(private readonly canvas: HTMLCanvasElement, private readonly foreground: HTMLElement) {
		this.renderer = new KoiRenderer(canvas);
		this.resizeObserver.observe(canvas);
		this.resizeObserver.observe(foreground);
		this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
		this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
		this.reducedMotion.addEventListener('change', this.schedule);
		document.addEventListener('visibilitychange', this.schedule);
		window.addEventListener('message', this.onHostMessage);
		window.addEventListener('pagehide', this.destroy);
		window.addEventListener('resize', this.invalidateLayout);
		window.addEventListener('click', this.onEmptyClick, { passive: true });
		this.updateTheme();
	}

	private updateTheme() {
		const classes = document.body.classList;
		this.highContrast = classes.contains('vscode-high-contrast') || classes.contains('vscode-high-contrast-light');
		const isLight = classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light');
		const background = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
		const rgb: Rgb = background && background.length >= 3
			? [Number(background[0]), Number(background[1]), Number(background[2])]
			: isLight ? [245, 245, 245] : [15, 15, 15];
		this.renderer.setTheme(isLight, rgb);
		this.layoutDirty = true;
		this.schedule();
	}

	private invalidateLayout = () => {
		this.layoutDirty = true;
		this.schedule();
	};

	private measureLayout() {
		const bounds = this.canvas.getBoundingClientRect();
		if (bounds.width < 1 || bounds.height < 1) { return false; }
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		if (bounds.width !== this.width || bounds.height !== this.height || dpr !== this.dpr) {
			this.width = bounds.width;
			this.height = bounds.height;
			this.dpr = dpr;
			const cellWidth = this.renderer.resize(bounds.width, bounds.height, dpr);
			if (this.canvas.parentElement) {
				this.canvas.parentElement.style.backgroundSize = `${cellWidth}px ${cellWidth + 2}px`;
			}
			this.world.resize(bounds.width, bounds.height);
		}
		const elements = [this.foreground, ...document.querySelectorAll<HTMLElement>('.cli-tutorial-button, .workspace-path')];
		const boxes: Box[] = elements.map(element => {
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left - bounds.left, top: rect.top - bounds.top,
				right: rect.right - bounds.left, bottom: rect.bottom - bounds.top
			};
		});
		this.world.avoid = boxes;
		this.renderer.setDimBoxes(boxes);
		this.layoutDirty = false;
		return true;
	}

	private schedule = () => {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		if (!this.hostVisible || document.hidden || this.highContrast || this.reducedMotion.matches) {
			this.renderer.clearRipples();
		}
		if (this.disposed || !this.hostVisible || document.hidden || this.highContrast) { return; }
		this.accumulator = 0;
		this.previousFrame = performance.now();
		this.previousTick = this.previousFrame;
		if (this.layoutDirty && !this.measureLayout()) { return; }
		if (this.reducedMotion.matches) {
			this.renderer.render(this.world);
			return;
		}
		this.raf = requestAnimationFrame(this.frame);
	};

	private frame = (now: number) => {
		this.accumulator += Math.min((now - this.previousTick) / 1000, 0.1);
		this.previousTick = now;
		const elapsed = now - this.previousFrame;
		if (elapsed + 0.1 >= frameInterval) {
			this.previousFrame = now - Math.max(0, elapsed - frameInterval) % frameInterval;
			if (this.layoutDirty && !this.measureLayout()) { this.raf = 0; return; }
			let steps = 0;
			while (this.accumulator >= simulationStep && steps < maxSteps) {
				this.world.step(simulationStep);
				this.accumulator -= simulationStep;
				steps++;
			}
			if (steps === maxSteps) { this.accumulator = 0; }
			this.renderer.render(this.world);
		}
		this.raf = requestAnimationFrame(this.frame);
	};

	private onHostMessage = (event: MessageEvent<HostToWebviewMessage>) => {
		if (event.data.type !== 'cli.visible' && event.data.type !== 'cli.hidden') { return; }
		this.hostVisible = event.data.type === 'cli.visible';
		this.layoutDirty = true;
		this.schedule();
	};

	private onEmptyClick = (event: MouseEvent) => {
		if (this.disposed || !this.hostVisible || document.hidden || this.highContrast || this.reducedMotion.matches
			|| event.button !== 0 || event.detail === 0 || event.defaultPrevented || window.getSelection()?.toString()) { return; }
		// The dispatch path survives controls being replaced during their own click handlers.
		if (event.composedPath().some(element => element === this.foreground
			|| element instanceof Element && element.matches('a, button, input, textarea, select, label, [role="button"], [contenteditable], .workspace-path'))) { return; }
		const now = performance.now();
		if (now - this.lastRippleTime < 120) { return; }
		const bounds = this.canvas.getBoundingClientRect();
		const x = event.clientX - bounds.left;
		const y = event.clientY - bounds.top;
		if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) { return; }
		this.lastRippleTime = now;
		this.renderer.addRipple(x, y, this.world.time);
	};

	private destroy = () => {
		this.disposed = true;
		cancelAnimationFrame(this.raf);
		this.resizeObserver.disconnect();
		this.themeObserver.disconnect();
		this.reducedMotion.removeEventListener('change', this.schedule);
		document.removeEventListener('visibilitychange', this.schedule);
		window.removeEventListener('message', this.onHostMessage);
		window.removeEventListener('pagehide', this.destroy);
		window.removeEventListener('resize', this.invalidateLayout);
		window.removeEventListener('click', this.onEmptyClick);
	};
}

export function mountLauncherBackground() {
	const canvas = document.getElementById('launcher-pond');
	const foreground = document.getElementById('launcher-view');
	if (!(canvas instanceof HTMLCanvasElement) || !foreground) { return; }
	try {
		new LauncherBackground(canvas, foreground);
	} catch (error) {
		// Canvas is decorative: an unavailable graphics context must not block agent selection.
		console.warn('[MySkills] Could not start CLI Hub background:', error);
	}
}
