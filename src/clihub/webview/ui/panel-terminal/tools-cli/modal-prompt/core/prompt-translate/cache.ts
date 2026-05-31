/**
 * prompt-translate/cache.ts
 *
 * Sistema de caché para traducciones.
 * Reutiliza la idea de ./analizar2/core/cache.ts
 *
 * Muy importante para evitar llamadas repetidas y mejorar velocidad.
 */

const cache = new Map<string, { text: string; timestamp: number }>();
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutos

export function buildCacheKey(text: string, from?: string, to?: string): string {
  return `${from ?? 'auto'}:${to ?? 'en'}:${text.trim()}`;
}

export function getCachedResult(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.text;
}

export function setCachedResult(key: string, translatedText: string): void {
  cache.set(key, {
    text: translatedText,
    timestamp: Date.now(),
  });
}

export function clearCache(): void {
  cache.clear();
}
