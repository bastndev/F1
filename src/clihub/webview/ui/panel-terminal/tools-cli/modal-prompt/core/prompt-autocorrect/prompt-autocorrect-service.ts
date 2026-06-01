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

	// Layer 1: Typo.js (now more conservative)
	const afterTypo = await runTypo(text);

	// Layer 2: LanguageTool (grammar + context)
	const { correctedText: finalText, correctionsMade: ltCorrections } =
		await applyLanguageToolCorrections(afterTypo);

	// Approximate count of Typo corrections
	const typoCorrections = (afterTypo !== text) ? 1 : 0; // simplified for now

	return {
		correctedText: finalText,
		typoCorrections,
		languageToolCorrections: ltCorrections,
	};
}
