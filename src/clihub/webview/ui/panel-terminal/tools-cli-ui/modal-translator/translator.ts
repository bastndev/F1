import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import loadingStyles from '../../../styles/skeleton/translator-loading.css';
import type { ToolContext } from '../tools';
import { translateEnToSpanish } from '../../../../core/tools-cli-core/modal-translation/browser-terminal-translator';

const stylesId = 'cli-translator-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = `${translatorStyles}\n${loadingStyles}`;
	document.head.append(style);
};

export const mountTranslatorPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = translatorHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeTranslatorBtn');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => context.close());
	}

	initializeTranslator(host, context);
};

function initializeTranslator(host: HTMLElement, context: ToolContext) {
	const speakBtn = host.querySelector<HTMLButtonElement>('#speakBtn');
	const spectrum = host.querySelector<HTMLElement>('#audioSpectrum');
	const copyBtn = host.querySelector<HTMLButtonElement>('#copyBtn');
	const translateBtn = host.querySelector<HTMLButtonElement>('#translateBtn');
	const textEl = host.querySelector<HTMLElement>('#translatedText');
	const modelEl = host.querySelector<HTMLElement>('#modelName');
	const modalEl = host.querySelector<HTMLElement>('.translator-modal');
	const bodyEl = host.querySelector<HTMLElement>('.translator-body');
	const statusEl = host.querySelector<HTMLElement>('.translator-status');

	const setStatus = (status: string) => {
		if (statusEl) {
			statusEl.textContent = status;
		}
	};

	// Translate via the extension host (chunked providers, cache, no CORS —
	// handles long multi-paragraph selections). The direct browser providers
	// remain only as a fallback if the host route is unavailable.
	const translateToSpanish = async (text: string): Promise<{ text: string; provider?: string }> => {
		if (context.translatePrompt) {
			try {
				const result = await context.translatePrompt({ text, from: 'en', to: 'es' });
				if (result.text.trim()) {
					return { text: result.text, provider: result.provider };
				}
			} catch (err) {
				console.warn('[Translator] Host translation failed, trying browser providers:', err);
			}
		}

		return { text: await translateEnToSpanish(text) };
	};

	const performTranslation = async () => {
		const extracted = extractTextToTranslate(context);
		if (!extracted) {
			if (textEl) {
				textEl.textContent = 'Select text in the terminal to translate it to Spanish.';
				textEl.classList.add('placeholder');
			}
			return;
		}

		if (!textEl || !modalEl) {
			return;
		}

		// Freeze the body at its current height so swapping the text for the
		// skeleton doesn't collapse the modal and snap it back on completion.
		const lockedHeight = bodyEl?.offsetHeight ?? 0;
		if (bodyEl) {
			bodyEl.style.height = `${lockedHeight}px`;
		}

		if (translateBtn) {
			translateBtn.disabled = true;
		}
		modalEl.classList.add('is-translating');
		textEl.classList.remove('placeholder');
		textEl.replaceChildren(buildSkeleton(lockedHeight));
		setStatus('translating…');

		try {
			const result = await translateToSpanish(extracted);
			revealText(textEl, result.text || extracted);
			setStatus(result.provider ? `translated · ${result.provider.toLowerCase()}` : 'translated');
		} catch (err) {
			console.error('[Translator] EN->ES failed:', err);
			textEl.textContent = extracted;
			setStatus('translation failed');
			// Failed attempts may be transient (rate limit, network) — allow retry.
			if (translateBtn) {
				translateBtn.disabled = false;
			}
		} finally {
			modalEl.classList.remove('is-translating');
			if (bodyEl) {
				bodyEl.style.height = '';
			}
		}
	};

	const labelEl = document.getElementById('cli-terminal-label');
	if (modelEl && labelEl) {
		const label = labelEl.textContent?.trim() || 'CLI';
		modelEl.textContent = label.toLowerCase().replace(/\s+(cli|code)\s*$/i, '');
	}

	let isSpeaking = false;
	const extracted = extractTextToTranslate(context);
	if (textEl) {
		if (extracted) {
			textEl.textContent = extracted;
			textEl.classList.add('placeholder');
		} else {
			textEl.textContent = 'Select text in the terminal to translate it to Spanish.';
			textEl.classList.add('placeholder');
		}
	}

	if (copyBtn && textEl) {
		copyBtn.addEventListener('click', async () => {
			const text = textEl.textContent || '';
			if (!text) {
				return;
			}

			try {
				await navigator.clipboard.writeText(text);
				const originalText = copyBtn.innerHTML;
				copyBtn.innerHTML = `<i class="ti ti-check"></i> <span>Copied</span>`;
				setTimeout(() => {
					copyBtn.innerHTML = originalText;
				}, 1400);
			} catch {
				console.log('Clipboard not available');
			}
		});
	}

	if (translateBtn) {
		translateBtn.addEventListener('click', () => {
			performTranslation();
		});
	}

	if (speakBtn && spectrum) {
		speakBtn.addEventListener('click', () => {
			isSpeaking = !isSpeaking;

			if (isSpeaking) {
				spectrum.classList.add('speaking');
				speakBtn.innerHTML = `<i class="ti ti-player-stop"></i> <span>Stop</span>`;
			} else {
				spectrum.classList.remove('speaking');
				speakBtn.innerHTML = `<i class="ti ti-volume-2"></i> <span>Listen</span>`;
			}
		});
	}
}

function extractTextToTranslate(context: ToolContext): string {
	return context.getTerminalSelection?.() || '';
}

function buildSkeleton(availableHeight: number): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-skeleton';
	wrap.setAttribute('aria-hidden', 'true');

	// The body is height-locked while loading; size the skeleton to fill it
	// edge to edge (minus the body's 16px vertical padding). Overflow clips.
	const contentHeight = Math.max(66, availableHeight - 32);
	wrap.style.height = `${contentHeight}px`;

	const scan = document.createElement('div');
	scan.className = 't-skel-scan';
	wrap.append(scan);

	const lines = document.createElement('div');
	lines.className = 't-skel-lines';
	wrap.append(lines);

	// One line per ~22px of field (13px font × 1.7 line-height), reserving
	// room for the typing row. Width pattern mimics prose; every 4th line
	// starts a new "paragraph".
	const pattern = ['full', 'long', 'full', 'med', 'long', 'short', 'full', 'long', 'med', 'full', 'short'];
	const lineCount = Math.min(60, Math.max(3, Math.floor((contentHeight - 30) / 22)));

	for (let i = 0; i < lineCount; i += 1) {
		const line = document.createElement('div');
		line.className = `t-skel-line ${pattern[i % pattern.length]}`;
		if (i > 0 && i % 4 === 0) {
			line.classList.add('t-skel-gap');
		}
		lines.append(line);
	}

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
	wrap.append(typing);

	return wrap;
}

function revealText(textEl: HTMLElement, value: string): void {
	textEl.textContent = value;
	textEl.classList.remove('is-revealing');
	// Restart the animation even if a previous reveal is still applied.
	void textEl.offsetWidth;
	textEl.classList.add('is-revealing');
	textEl.addEventListener('animationend', () => {
		textEl.classList.remove('is-revealing');
	}, { once: true });
}
