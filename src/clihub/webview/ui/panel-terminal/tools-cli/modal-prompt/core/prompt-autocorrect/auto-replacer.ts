import { getTypoInstance } from './typo-service';
import { applyPersonalMistakes } from './data/personal-mistakes';
import { isProtectedTerm } from './data/protected-terms';

const protectedPattern = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s"'`<>]+|[\w.-]+@[\w.-]+\.\w{2,}|(?:\.{1,2}\/|~\/|\/)[^\s"'`<>]+|#[0-9a-fA-F]{3,8}\b/g;

export async function autocorrectText(text: string): Promise<string> {
	// Layer 1: personal mistakes first (handles multi-word patterns like 'quieroq ue')
	let processed = applyPersonalMistakes(text);

	const typo = await getTypoInstance();
	if (!typo) {
		return processed;
	}

	let result = '';
	let lastIndex = 0;

	for (const match of processed.matchAll(protectedPattern)) {
		const index = match.index ?? 0;
		result += replaceSegment(processed.slice(lastIndex, index), typo);
		result += match[0];
		lastIndex = index + match[0].length;
	}
	result += replaceSegment(processed.slice(lastIndex), typo);
	return result;
}

function replaceSegment(segment: string, typo: any): string {
	const wordPattern = /[\p{L}]+/gu;
	return segment.replace(wordPattern, (word) => {
		// Allow short words through — personal-mistakes handles 1-2 char abbreviations
		if (word.length < 1) { return word; }
		// Do not touch protected technical terms
		if (isProtectedTerm(word)) { return word; }
		if (typo.check(word)) { return word; }
		const suggestions = typo.suggest(word);
		if (!suggestions || suggestions.length === 0) { return word; }
		// Be conservative on very short words to avoid false positives
		if (word.length <= 3) {
			// Only correct if suggestion is very close (same length ±1)
			const s = suggestions[0];
			if (Math.abs(s.length - word.length) <= 1) {
				return applyOriginalCasing(word, s);
			}
			return word;
		}
		// Aggressively correct short-medium words
		if (word.length <= 8) {
			return applyOriginalCasing(word, suggestions[0]);
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
