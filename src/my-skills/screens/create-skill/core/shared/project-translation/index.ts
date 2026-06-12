import { getCachedTranslation, setCachedTranslation } from './cache';
import { translateWithGoogle, translateWithMyMemory } from './providers';

let currentTranslationPromise: Promise<string> | null = null;
let lastTranslatedQuery: string = '';

export async function translateQuery(query: string, targetLang: string = 'en'): Promise<string> {
	const cleanQuery = query.trim();
	if (!cleanQuery) {
		return '';
	}

	// 1. Check cache first
	const cached = getCachedTranslation(cleanQuery);
	if (cached) {
		return cached;
	}

	// 2. Prevent overlapping identical requests
	if (lastTranslatedQuery === cleanQuery && currentTranslationPromise) {
		return currentTranslationPromise;
	}

	lastTranslatedQuery = cleanQuery;

	currentTranslationPromise = (async () => {
		try {
			// Primary: Google
			const translated = await translateWithGoogle(cleanQuery, targetLang);
			setCachedTranslation(cleanQuery, translated);
			return translated;
		} catch (error) {
			console.warn('[MySkills] Google Translate failed, falling back to MyMemory:', error);
			try {
				// Fallback: MyMemory
				const translated = await translateWithMyMemory(cleanQuery, targetLang);
				setCachedTranslation(cleanQuery, translated);
				return translated;
			} catch (fallbackError) {
				console.error('[MySkills] Both translation providers failed:', fallbackError);
				// If both fail, return original to avoid breaking the user's flow
				return cleanQuery;
			}
		}
	})();

	return currentTranslationPromise;
}

export { getCachedTranslation };
