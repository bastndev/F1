/**
 * Inline SVG icons for the prompt modal.
 *
 * Tabler Icons (`ti-*`) are not loaded in this webview context, so we ship
 * self-contained SVGs instead. They keep the same 24x24 / 2px outline style
 * and inherit the parent color via `currentColor`.
 */

export type PromptIcon =
	| 'cpu'
	| 'send'
	| 'refresh'
	| 'chartBar'
	| 'sparkles'
	| 'loader2'
	| 'language'
	| 'spellCheck';

const ICON_PATHS: Record<PromptIcon, string> = {
	cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M15 2v2M15 20v2M20 15h2M20 9h2M4 15H2M4 9H2M9 20v2M9 2v2"/>',
	send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
	refresh: '<path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
	chartBar: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
	sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
	loader2: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
	language: '<path d="m5 8 6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
	spellCheck: '<path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="m4 21 2-2"/><path d="m18 19 2 2"/><path d="m22 21-2-2"/><path d="m16 19-2 2"/>',
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
