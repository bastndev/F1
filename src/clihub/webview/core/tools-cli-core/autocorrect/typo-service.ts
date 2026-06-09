import Typo from 'typo-js';

let typoInstance: Typo | null = null;
let isLoaded = false;
let loadPromise: Promise<void> | null = null;

export async function getTypoInstance(): Promise<Typo | null> {
	if (isLoaded) { return typoInstance; }
	if (loadPromise) { await loadPromise; return typoInstance; }

	loadPromise = (async () => {
		try {
			const scriptEl = document.querySelector<HTMLScriptElement>('script[src$="webview.js"]');
			if (!scriptEl) { throw new Error('webview.js script not found'); }
			
			const baseUrl = new URL('.', scriptEl.src).href;
			// Folders are copied as-is from the webview directory
				const affUrl = baseUrl + 'core/tools-cli-core/autocorrect/dictionaries/es.aff';
				const dicUrl = baseUrl + 'core/tools-cli-core/autocorrect/dictionaries/es.dic';

			const [affRes, dicRes] = await Promise.all([
				fetch(affUrl),
				fetch(dicUrl)
			]);

			if (!affRes.ok || !dicRes.ok) {
				throw new Error('Failed to load dictionary files');
			}

			const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);

			// Typo-js expects the name of the language, the .aff content, and the .dic content
			typoInstance = new Typo('es', aff, dic);
			isLoaded = true;
		} catch (e) {
			console.error('Error loading typo.js dictionaries:', e);
			typoInstance = null;
			isLoaded = false;
			loadPromise = null;
		}
	})();

	await loadPromise;
	return typoInstance;
}

export function warmTypoInstance(): void {
	void getTypoInstance();
}
