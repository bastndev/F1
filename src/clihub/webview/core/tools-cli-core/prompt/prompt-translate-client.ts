import type { PromptTranslateClient, PromptTranslateResult } from './prompt-translate-types';

export async function translatePromptText(
	text: string,
	client: PromptTranslateClient,
): Promise<PromptTranslateResult> {
	const cleanText = text.trim();
	if (!cleanText) {
		return { text: '' };
	}

	if (!client.translatePrompt) {
		throw new Error('Prompt translation is not available.');
	}

	return client.translatePrompt({
		text: cleanText,
		from: 'es',
		to: 'en',
	});
}

