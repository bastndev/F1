/**
 * Inline SVG icons for the prompt modal.
 *
 * Only two footer buttons (resume / usage) get decorative icons, and only
 * when the footer is compact. The translate toggle keeps a spinner for its
 * loading state. Everything else is text-only.
 */

export type PromptIcon = 'refresh' | 'chartBar' | 'loader2';

const ICON_PATHS: Record<PromptIcon, string> = {
	refresh: '<path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
	chartBar: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
	loader2: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
};

/** Return an inline SVG string for the named icon. */
export function iconSvg(name: PromptIcon, size = 14, className = 'prompt-icon'): string {
	const cls = [className].filter(Boolean).join(' ');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

/** Create an SVG element for the named icon. */
export function iconEl(name: PromptIcon, size = 14, className = 'prompt-icon'): SVGSVGElement {
	const wrapper = document.createElement('div');
	wrapper.innerHTML = iconSvg(name, size, className);
	const svg = wrapper.querySelector('svg');
	if (!svg) {
		throw new Error(`[PromptIcon] failed to build icon: ${name}`);
	}
	return svg;
}
