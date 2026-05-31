/**
 * prompt-translate/types.ts
 *
 * Tipos para el módulo de traducción (principalmente hacia inglés).
 * Inspirado en la estructura de ./analizar2/core/types.ts
 */

export type TranslationProviderId = 'google' | 'myMemory' | 'cache';

export interface TranslateOptions {
  from?: string; // 'auto' | 'es' | 'fr' | etc.
  to?: 'en';     // Por ahora solo nos interesa inglés
  signal?: AbortSignal;
}

export interface TranslationResult {
  text: string;
  providerId: TranslationProviderId;
  providerName: string;
  fromCache?: boolean;
}
