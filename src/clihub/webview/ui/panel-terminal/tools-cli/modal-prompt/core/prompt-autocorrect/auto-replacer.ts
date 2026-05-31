import { getTypoInstance } from './typo-service';

const protectedPattern = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s"'`<>]+|[\w.-]+@[\w.-]+\.\w{2,}|(?:\.{1,2}\/|~\/|\/)[^\s"'`<>]+|#[0-9a-fA-F]{3,8}\b/g;

export async function autocorrectText(text: string): Promise<string> {
	const typo = await getTypoInstance();
	if (!typo) {
		return text; // Fallback to original text if typo failed to load
	}

	let result = '';
	let lastIndex = 0;

	for (const match of text.matchAll(protectedPattern)) {
		const index = match.index ?? 0;
		result += replaceSegment(text.slice(lastIndex, index), typo);
		result += match[0];
		lastIndex = index + match[0].length;
	}

	result += replaceSegment(text.slice(lastIndex), typo);
	return result;
}

function replaceSegment(segment: string, typo: any): string {
	// Match words, including accented characters
	const wordPattern = /[\p{L}]+/gu;
	return segment.replace(wordPattern, (word) => {
		// Minimum length to correct
		if (word.length < 3) { return word; }

		// Typo.js check
		if (typo.check(word)) {
			return word;
		}

		// If misspelled, get suggestions
		const suggestions = typo.suggest(word);
		if (suggestions && suggestions.length > 0) {
			const bestSuggestion = suggestions[0];
			return applyOriginalCasing(word, bestSuggestion);
		}

		return word;
	});
}

function applyOriginalCasing(original: string, correction: string): string {
	if (original.toUpperCase() === original) {
		return correction.toUpperCase();
	}
	const firstChar = original.charAt(0);
	if (firstChar.toUpperCase() === firstChar && firstChar.toLowerCase() !== firstChar) {
		return correction.charAt(0).toUpperCase() + correction.slice(1);
	}
	return correction;
}
