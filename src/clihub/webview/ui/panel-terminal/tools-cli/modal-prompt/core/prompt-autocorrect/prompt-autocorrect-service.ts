/**
 * prompt-autocorrect-service.ts
 *
 * Orquestador de las dos capas (inspirado en el SpellCheckService del plan anterior).
 *
 * Flujo actual:
 *   1. Typo.js (ortografía básica - más conservador ahora)
 *   2. LanguageTool (gramática y contexto - la parte "inteligente")
 */

import { autocorrectText as runTypo } from './auto-replacer';
import { applyLanguageToolCorrections } from './language-tool-service';

export interface AutocorrectResult {
	correctedText: string;
	typoCorrections: number;
	languageToolCorrections: number;
}

export async function runFullAutocorrect(text: string): Promise<AutocorrectResult> {
	if (!text || text.trim().length < 3) {
		return {
			correctedText: text,
			typoCorrections: 0,
			languageToolCorrections: 0,
		};
	}

	// Capa 1: Typo.js (ya mejorado con lógica más conservadora)
	const afterTypo = await runTypo(text);

	// Capa 2: LanguageTool (gramática + contexto)
	const { correctedText: finalText, correctionsMade: ltCorrections } =
		await applyLanguageToolCorrections(afterTypo);

	// Contamos cuántas hizo Typo (aproximado)
	const typoCorrections = (afterTypo !== text) ? 1 : 0; // simplificado por ahora

	return {
		correctedText: finalText,
		typoCorrections,
		languageToolCorrections: ltCorrections,
	};
}
