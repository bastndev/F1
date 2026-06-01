import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import type { ToolContext } from '../tools';
import { extractTextToTranslate } from './core/copy-txt';

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

	initTranslator(host, context);
};

function initTranslator(host: HTMLElement, context: ToolContext) {
	const speakBtn = host.querySelector<HTMLButtonElement>('#speakBtn');
	const spectrum = host.querySelector<HTMLElement>('#audioSpectrum');
	const copyBtn = host.querySelector<HTMLButtonElement>('#copyBtn');
	const textEl = host.querySelector<HTMLElement>('#translatedText');
	const modelEl = host.querySelector<HTMLElement>('#modelName');

	const modalEl = host.querySelector<HTMLElement>('.translator-modal');
	
	let currentTargetLang = 'es'; // default: Español

	const performTranslation = async () => {
		const extracted = extractTextToTranslate(context);
		if (!extracted) {
			if (textEl) {
				textEl.textContent = 'Please select text in the terminal to translate.';
				textEl.classList.add('placeholder');
			}
			return;
		}

		if (!textEl || !modalEl || !context.translatePrompt) {
			if (textEl) {
				textEl.textContent = extracted;
				textEl.classList.remove('placeholder');
			}
			return;
		}

		modalEl.classList.add('is-translating');
		// Optional: you can show a loading state on the text itself, or just leave the original text while loading
		textEl.textContent = extracted;
		textEl.classList.remove('placeholder');

		try {
			const result = await context.translatePrompt({
				text: extracted,
				from: 'auto',
				to: currentTargetLang
			});
			
			if (result.text) {
				textEl.textContent = result.text;
			}
		} catch (err) {
			console.error('Translation error:', err);
		} finally {
			modalEl.classList.remove('is-translating');
		}
	};

	// Update model name from active CLI (same pattern as Prompt)
	const labelEl = document.getElementById('cli-terminal-label');
	if (modelEl && labelEl) {
		const label = labelEl.textContent?.trim() || 'CLI';
		modelEl.textContent = label.toLowerCase().replace(/\s*(cli|code)\s*$/i, '');
	}

	let isSpeaking = false;

	// === Language Selector (target language) ===
	const langSelector = host.querySelector<HTMLElement>('#langSelector');

	if (langSelector) {
		const options = langSelector.querySelectorAll<HTMLButtonElement>('.lang-option');

		options.forEach((option) => {
			option.addEventListener('click', () => {
				if (option.classList.contains('active')) {
					return;
				}
				
				options.forEach((o) => o.classList.remove('active'));
				option.classList.add('active');
				currentTargetLang = option.dataset.lang || 'es';
				performTranslation();
			});
		});
	}

	// Trigger initial translation
	performTranslation();

	// Copy functionality
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
			} catch (e) {
				console.log('Clipboard not available');
			}
		});
	}

	// Fake Speak + Spectrum
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
