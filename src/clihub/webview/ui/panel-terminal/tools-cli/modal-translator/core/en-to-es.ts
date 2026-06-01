/**
 * Minimal, dedicated English → Spanish translator
 * Used exclusively by the Translator modal for terminal/CLI output.
 *
 * Direct fetch to Google unofficial endpoint (no extension host, no extra providers).
 * Hardcoded EN → ES as per requirement.
 */

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const TIMEOUT_MS = 9000;

export async function translateEnToSpanish(text: string): Promise<string> {
	const clean = text.trim();
	if (!clean) {
		return '';
	}

	const params = new URLSearchParams({
		client: 'gtx',
		sl: 'en',
		tl: 'es',
		dt: 't',
		q: clean,
	});

	const url = `${GOOGLE_TRANSLATE_URL}?${params.toString()}`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`Translation request failed with status ${response.status}`);
		}

		const data = await response.json();
		return parseGoogleTranslateResponse(data);
	} catch (error) {
		if (controller.signal.aborted) {
			throw new Error('Translation timed out.');
		}
		console.warn('[Translator] EN→ES direct translation failed:', error);
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

function parseGoogleTranslateResponse(response: unknown): string {
	if (!Array.isArray(response) || !Array.isArray(response[0])) {
		throw new Error('Unexpected translation response format.');
	}

	const text = response[0]
		.map((segment: unknown) =>
			Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''
		)
		.join('');

	if (!text.trim()) {
		throw new Error('Translation returned empty result.');
	}

	return decodeHtmlEntities(text);
}

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
