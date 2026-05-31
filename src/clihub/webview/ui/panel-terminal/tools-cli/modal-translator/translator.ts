import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';

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

export const mountTranslatorPanel = (host: HTMLElement) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = translatorHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));

	initTranslator(host);
};

function initTranslator(host: HTMLElement) {
	const speakBtn = host.querySelector<HTMLButtonElement>('#speakBtn');
	const spectrum = host.querySelector<HTMLElement>('#audioSpectrum');
	const copyBtn = host.querySelector<HTMLButtonElement>('#copyBtn');
	const textEl = host.querySelector<HTMLElement>('#translatedText');
	const modelEl = host.querySelector<HTMLElement>('#modelName');

	// Update model name from active CLI (same pattern as Prompt)
	const labelEl = document.getElementById('cli-terminal-label');
	if (modelEl && labelEl) {
		const label = labelEl.textContent?.trim() || 'CLI';
		modelEl.textContent = label.toLowerCase().replace(/\s*(cli|code)\s*$/i, '');
	}

	let isSpeaking = false;

	// === Language Selector (target language) ===
	const langSelector = host.querySelector<HTMLElement>('#langSelector');
	let currentTargetLang = 'es'; // default: Español

	if (langSelector) {
		const options = langSelector.querySelectorAll<HTMLButtonElement>('.lang-option');

		options.forEach((option) => {
			option.addEventListener('click', () => {
				options.forEach((o) => o.classList.remove('active'));
				option.classList.add('active');
				currentTargetLang = option.dataset.lang || 'es';
			});
		});
	}

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
				copyBtn.innerHTML = `<i class="ti ti-check"></i> <span>Copiado</span>`;
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
				speakBtn.innerHTML = `<i class="ti ti-player-stop"></i> <span>Detener</span>`;
			} else {
				spectrum.classList.remove('speaking');
				speakBtn.innerHTML = `<i class="ti ti-volume-2"></i> <span>Escuchar</span>`;
			}
		});
	}
}
