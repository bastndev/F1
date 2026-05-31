import { autocorrectText } from './auto-replacer';

/**
 * Applies offline, dictionary-based autocorrection to the prompt text using Typo.js.
 * This function preserves protected ranges like code blocks, URLs, and paths.
 */
export async function applyAutocorrect(text: string): Promise<string> {
	return autocorrectText(text);
}
