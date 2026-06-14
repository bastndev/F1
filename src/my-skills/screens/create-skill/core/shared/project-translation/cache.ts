export const translationCache = new Map<string, string>();

export function getCachedTranslation(query: string): string | undefined {
	return translationCache.get(query.trim());
}

export function setCachedTranslation(query: string, translated: string): void {
	translationCache.set(query.trim(), translated);
}
