import { autocorrectTextWithStats as runLocalAutocorrect } from './auto-replacer';
import { applyLanguageToolCorrections } from './language-tool-service';

export interface AutocorrectResult {
	correctedText: string;
	personalCorrections: number;
	typoCorrections: number;
	languageToolCorrections: number;
}

export interface AutocorrectOptions {
	useLanguageTool?: boolean;
}

export async function runFullAutocorrect(text: string, options: AutocorrectOptions = {}): Promise<AutocorrectResult> {
	if (!text || text.trim().length < 3) {
		return {
			correctedText: text,
			personalCorrections: 0,
			typoCorrections: 0,
			languageToolCorrections: 0,
		};
	}

	const local = await runLocalAutocorrect(text);

	if (options.useLanguageTool !== true) {
		return {
			correctedText: local.correctedText,
			personalCorrections: local.personalCorrections,
			typoCorrections: local.personalCorrections + local.typoCorrections,
			languageToolCorrections: 0,
		};
	}

	const { correctedText: finalText, correctionsMade: ltCorrections } =
		await applyLanguageToolCorrections(local.correctedText);

	return {
		correctedText: finalText,
		personalCorrections: local.personalCorrections,
		typoCorrections: local.personalCorrections + local.typoCorrections,
		languageToolCorrections: ltCorrections,
	};
}
