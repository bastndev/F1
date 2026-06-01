export interface LTMatch {
	message: string;
	offset: number;
	length: number;
	replacements: Array<{ value: string }>;
	rule: { issueType: string };
}

export interface LanguageToolError {
	word: string;
	offset: number;
	length: number;
	message: string;
	suggestions: string[];
	severity: 'grammar' | 'style' | 'spelling';
}

const LT_API_URL = 'https://api.languagetoolplus.com/v2/check';

export async function checkWithLanguageTool(text: string): Promise<LanguageToolError[]> {
	if (!text || text.trim().length < 3) {
		return [];
	}

	try {
		const params = new URLSearchParams({
			text: text,
			language: 'es',           // Spanish only for now
			enabledOnly: 'false',
		});

		const response = await fetch(LT_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params.toString(),
			signal: AbortSignal.timeout(8000), // 8 second timeout

		});

		if (!response.ok) {
			console.warn('[LanguageTool] API error:', response.status);
			return [];
		}

		const data = await response.json();
		const matches: LTMatch[] = data.matches || [];

		return matches.map((match) => ({
			word: text.substring(match.offset, match.offset + match.length),
			offset: match.offset,
			length: match.length,
			message: match.message,
			suggestions: match.replacements.map(r => r.value).slice(0, 5),
			severity: match.rule.issueType === 'misspelling' ? 'spelling' : 
			          match.rule.issueType === 'grammar' ? 'grammar' : 'style',
		}));
	} catch (error) {
		console.warn('[LanguageTool] Error llamando a la API:', error);
		return [];
	}
}

/**
 * Applies LanguageTool corrections conservatively.
 * Only applies when there's a clear single suggestion.
 */
export async function applyLanguageToolCorrections(text: string): Promise<{
	correctedText: string;
	correctionsMade: number;
}> {
	const errors = await checkWithLanguageTool(text);

	if (errors.length === 0) {
		return { correctedText: text, correctionsMade: 0 };
	}

	let correctedText = text;
	let correctionsMade = 0;

	// Apply from the end to the beginning to preserve offsets
	const sorted = [...errors].sort((a, b) => b.offset - a.offset);

	for (const err of sorted) {
		// Only apply if there are suggestions and it's a clear grammar/style error
		if (err.suggestions.length > 0 && (err.severity === 'grammar' || err.severity === 'style')) {
			const replacement = err.suggestions[0];
			correctedText =
				correctedText.slice(0, err.offset) +
				replacement +
				correctedText.slice(err.offset + err.length);
			correctionsMade++;
		}
	}

	return { correctedText, correctionsMade };
}
