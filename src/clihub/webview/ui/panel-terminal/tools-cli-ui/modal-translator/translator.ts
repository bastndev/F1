import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import type { ToolContext } from '../tools';
import { translateEnToSpanish } from '../../../../core/tools-cli-core/modal-translation/browser-terminal-translator';

const stylesId = 'cli-translator-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = translatorStyles;
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

		modalEl.classList.add('is-translating');
		textEl.textContent = 'Translating...';
		textEl.classList.remove('placeholder');

		try {
			const spanish = await translateEnToSpanish(extracted);
			textEl.textContent = spanish || extracted;
		} catch (err) {
			console.error('[Translator] EN->ES failed:', err);
			textEl.textContent = extracted;
		} finally {
			modalEl.classList.remove('is-translating');
		}
	};

	const labelEl = document.getElementById('cli-terminal-label');
	if (modelEl && labelEl) {
		const label = labelEl.textContent?.trim() || 'CLI';
		modelEl.textContent = label.toLowerCase().replace(/\s*(cli|code)\s*$/i, '');
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
