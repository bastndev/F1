/**
 * Translator modal logic (behavior).
 *
 * All the important logic for the Translator tool lives here, as required.
 * This file handles:
 *   - Extracting selected text from terminal
 *   - Triggering EN → ES translation
 *   - Wiring UI controls (copy, fake speak)
 *   - Updating model label
 *   - Managing loading state
 */

import type { ToolContext } from '../../tools';
import { extractTextToTranslate } from './copy-txt';
import { translateEnToSpanish } from './en-to-es';

export function initializeTranslator(host: HTMLElement, context: ToolContext) {
	const speakBtn = host.querySelector<HTMLButtonElement>('#speakBtn');
	const spectrum = host.querySelector<HTMLElement>('#audioSpectrum');
	const copyBtn = host.querySelector<HTMLButtonElement>('#copyBtn');
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
		textEl.textContent = extracted;
		textEl.classList.remove('placeholder');

		try {
			const spanish = await translateEnToSpanish(extracted);
			textEl.textContent = spanish || extracted;
		} catch (err) {
			console.error('[Translator] EN→ES failed:', err);
			textEl.textContent = extracted;
			textEl.classList.add('placeholder');
		} finally {
			modalEl.classList.remove('is-translating');
		}
	};

	// Update model name from active CLI
	const labelEl = document.getElementById('cli-terminal-label');
	if (modelEl && labelEl) {
		const label = labelEl.textContent?.trim() || 'CLI';
		modelEl.textContent = label.toLowerCase().replace(/\s*(cli|code)\s*$/i, '');
	}

	let isSpeaking = false;

	// Auto-translate on open (shows English briefly → loading animation → Spanish)
	performTranslation();

	// Copy button
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

	// Fake Speak + Spectrum (UI only)
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
