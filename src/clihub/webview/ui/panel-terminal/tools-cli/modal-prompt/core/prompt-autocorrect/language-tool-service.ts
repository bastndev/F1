/**
 * language-tool-service.ts
 *
 * Capa 2 — LanguageTool (gramática + contexto)
 *
 * Esta es la pieza "inteligente" que faltaba.
 * Basada en la arquitectura del plan original (SpellCheckService de ./analizar/).
 *
 * Por ahora hace una llamada simple a la API pública de LanguageTool.
 * Más adelante podemos mejorarla con debounce, merging de errores, etc.
 */

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
			language: 'es',           // Por ahora solo español
			enabledOnly: 'false',
		});

		const response = await fetch(LT_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params.toString(),
			signal: AbortSignal.timeout(8000), // 8 segundos de timeout
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
 * Aplica correcciones de LanguageTool de forma conservadora.
 * Actualmente solo aplica si hay una sugerencia clara.
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

	// Aplicamos de atrás hacia adelante
	const sorted = [...errors].sort((a, b) => b.offset - a.offset);

	for (const err of sorted) {
		// Solo aplicamos si hay sugerencias y es un error claro de gramática o estilo
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
