/**
 * prompt-autocorrect/autocorrect-service.ts
 *
 * Núcleo del módulo de corrección ortográfica/gramatical.
 *
 * Esta clase será una versión "headless" (sin UI) del SpellCheckService
 * que existe en ./analizar/SpellCheckService.ts
 *
 * Responsabilidades futuras:
 * - Orquestar Typo.js (capa 1) + LanguageTool (capa 2)
 * - Devolver texto corregido automáticamente
 * - Ser usada por prompt-processor.ts
 */

import type { AutocorrectOptions, AutocorrectResult } from './types';

export class AutocorrectService {
  constructor() {
    // TODO: Inicializar providers (typo + language-tool)
  }

  async correct(text: string, options?: AutocorrectOptions): Promise<AutocorrectResult> {
    // TODO: Implementar pipeline de corrección silenciosa
    // Por ahora devuelve el texto sin modificar
    return {
      correctedText: text,
      corrections: [],
      appliedCorrections: 0,
    };
  }

  destroy(): void {
    // TODO: Limpiar timers (debounce de LanguageTool)
  }
}

// Instancia singleton recomendada para el módulo
let instance: AutocorrectService | null = null;

export function getAutocorrectService(): AutocorrectService {
  if (!instance) {
    instance = new AutocorrectService();
  }
  return instance;
}
