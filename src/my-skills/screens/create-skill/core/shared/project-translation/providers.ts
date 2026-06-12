const DEFAULT_TIMEOUT_MS = 4000;

export async function translateWithGoogle(text: string, targetLang: string = 'en'): Promise<string> {
	const params = new URLSearchParams({
		client: 'gtx',
		sl: 'auto',
		tl: targetLang,
		dt: 't',
		q: text
	});

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

	try {
		const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`Google Translate API Error: ${response.status}`);
		}

		const data = await response.json();
		let translatedText = '';
		
		// Expected format: [[[ "translation", "original", null, null, 1 ]], null, "es"]
		if (Array.isArray(data) && Array.isArray(data[0])) {
			for (const chunk of data[0]) {
				if (Array.isArray(chunk) && typeof chunk[0] === 'string') {
					translatedText += chunk[0];
				}
			}
		}

		if (!translatedText) {
			throw new Error('Empty response from Google Translate');
		}

		return translatedText;
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function translateWithMyMemory(text: string, targetLang: string = 'en'): Promise<string> {
	const params = new URLSearchParams({
		q: text,
		langpair: `Autodetect|${targetLang}`,
		mt: '1'
	});

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

	try {
		const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`MyMemory API Error: ${response.status}`);
		}

		const data = (await response.json()) as { responseData?: { translatedText?: string } };
		if (data.responseData?.translatedText) {
			return data.responseData.translatedText;
		}

		throw new Error('Empty response from MyMemory');
	} finally {
		clearTimeout(timeoutId);
	}
}
