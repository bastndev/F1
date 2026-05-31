/**
 * prompt-translate/providers/google-translate.ts
 *
 * Adaptador para traducción usando Google Translate (o alternativa).
 *
 * Placeholder basado en ideas de ./analizar2
 */

import type { TranslationResult } from '../types';

export async function translateWithGoogle(
  text: string,
  from: string,
  to: string = 'en'
): Promise<TranslationResult> {
  // TODO: Usar @vitalets/google-translate-api o fetch directo
  // Por ahora devuelve el texto sin traducir
  return {
    text,
    providerId: 'google',
    providerName: 'Google Translate (placeholder)',
  };
}
