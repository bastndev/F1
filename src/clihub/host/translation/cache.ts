import type { PromptTranslationResult } from './types';

const maxCacheEntries = 250;
const translationCache = new Map<string, PromptTranslationResult>();

export function buildCacheKey(text: string, from: string, to: string): string {
	return `${from || 'auto'}\u0000${to}\u0000${text}`;
}

export function getCachedTranslation(key: string): PromptTranslationResult | undefined {
	const cached = translationCache.get(key);
	if (!cached) {
		return undefined;
	}

	return {
		...cached,
		fromCache: true,
	};
}

export function setCachedTranslation(key: string, value: PromptTranslationResult): void {
	if (translationCache.size >= maxCacheEntries) {
		const oldestKey = translationCache.keys().next().value;
		if (oldestKey !== undefined) {
			translationCache.delete(oldestKey);
		}
	}

	translationCache.set(key, {
		text: value.text,
		providerId: value.providerId,
		providerName: value.providerName,
	});
}

