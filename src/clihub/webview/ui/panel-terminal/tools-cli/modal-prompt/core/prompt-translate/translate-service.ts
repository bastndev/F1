/**
 * prompt-translate/translate-service.ts
 *
 * Servicio principal de traducción.
 * Inspirado en ./analizar2/core/translationService.ts
 *
 * Actualmente es un placeholder. La implementación real combinará:
 * - Caché (cache.ts)
 * - Proveedores (providers/)
 * - Lógica de fallback
 */

import type { TranslateOptions, TranslationResult } from './types';

export class TranslateService {
  async translateToEnglish(text: string, options?: TranslateOptions): Promise<TranslationResult> {
    // TODO: Implementar pipeline real:
    // 1. Revisar caché
    // 2. Llamar proveedor
    // 3. Guardar en caché

    return {
      text,
      providerId: 'cache',
      providerName: 'No-Op (placeholder)',
      fromCache: false,
    };
  }
}

let instance: TranslateService | null = null;

export function getTranslateService(): TranslateService {
  if (!instance) instance = new TranslateService();
  return instance;
}
