/**
 * English → Spanish translator with multiple free providers.
 * Used exclusively by the Translator modal for terminal/CLI output.
 *
 * Provider cascade (all free, no API key):
 *   1. MyMemory    — api.mymemory.translated.net
 *   2. Lingva      — lingva.thedaviddelta.com (Google mirror, CORS-friendly)
 *   3. LibreTranslate — libretranslate.de (open-source)
 *
 * Tries each in order; falls back to the next on failure.
 */

const TIMEOUT_MS = 10000;

type TranslationProvider = {
	name: string;
	translate: (text: string, signal: AbortSignal) => Promise<string>;
};

// ── Provider: MyMemory ─────────────────────────────────────────────
async function translateMyMemory(text: string, signal: AbortSignal): Promise<string> {
	const params = new URLSearchParams({
		q: text,
		langpair: 'en|es',
	});

	const res = await fetch(
		`https://api.mymemory.translated.net/get?${params.toString()}`,
		{ signal }
	);

	if (!res.ok) {
		throw new Error(`MyMemory HTTP ${res.status}`);
	}

	const json = await res.json() as {
		responseData?: { translatedText?: string };
		responseStatus?: number;
	};

	if (json.responseStatus && json.responseStatus >= 400) {
		throw new Error(`MyMemory status ${json.responseStatus}`);
	}

	const translated = json.responseData?.translatedText;
	if (!translated?.trim()) {
		throw new Error('MyMemory returned empty result.');
	}

	return decodeHtmlEntities(translated);
}

// ── Provider: Lingva Translate (Google mirror) ─────────────────────
async function translateLingva(text: string, signal: AbortSignal): Promise<string> {
	const encoded = encodeURIComponent(text);
	const res = await fetch(
		`https://lingva.thedaviddelta.com/api/v1/en/es/${encoded}`,
		{ signal }
	);

	if (!res.ok) {
		throw new Error(`Lingva HTTP ${res.status}`);
	}

	const json = await res.json() as { translation?: string };
	const translated = json.translation;
	if (!translated?.trim()) {
		throw new Error('Lingva returned empty result.');
	}

	return translated;
}

// ── Provider: LibreTranslate ───────────────────────────────────────
async function translateLibre(text: string, signal: AbortSignal): Promise<string> {
	const res = await fetch('https://libretranslate.de/translate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			q: text,
			source: 'en',
			target: 'es',
			format: 'text',
		}),
		signal,
	});

	if (!res.ok) {
		throw new Error(`LibreTranslate HTTP ${res.status}`);
	}

	const json = await res.json() as { translatedText?: string };
	const translated = json.translatedText;
	if (!translated?.trim()) {
		throw new Error('LibreTranslate returned empty result.');
	}

	return translated;
}

// ── Provider list (tried in order) ─────────────────────────────────
const providers: TranslationProvider[] = [
	{ name: 'MyMemory', translate: translateMyMemory },
	{ name: 'Lingva', translate: translateLingva },
	{ name: 'LibreTranslate', translate: translateLibre },
];

// ── Public API ─────────────────────────────────────────────────────
export async function translateEnToSpanish(text: string): Promise<string> {
	const clean = text.trim();
	if (!clean) {
		return '';
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

	const errors: string[] = [];

	try {
		for (const provider of providers) {
			try {
				const result = await provider.translate(clean, controller.signal);
				console.log(`[Translator] ✓ ${provider.name} succeeded`);
				return result;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(`[Translator] ✗ ${provider.name} failed: ${msg}`);
				errors.push(`${provider.name}: ${msg}`);

				if (controller.signal.aborted) {
					throw new Error('Translation timed out.');
				}
			}
		}

		throw new Error(`All providers failed:\n${errors.join('\n')}`);
	} finally {
		clearTimeout(timeoutId);
	}
}

// ── Utilities ──────────────────────────────────────────────────────
function decodeHtmlEntities(text: string): string {
	const namedEntities: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		'#39': "'",
	};

	return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (entity, name: string) => {
		const normalized = name.toLowerCase();
		if (normalized.startsWith('#x')) {
			try {
				return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
			} catch {
				return entity;
			}
		}
		if (normalized.startsWith('#')) {
			try {
				return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
			} catch {
				return entity;
			}
		}
		return namedEntities[normalized] ?? entity;
	});
}
