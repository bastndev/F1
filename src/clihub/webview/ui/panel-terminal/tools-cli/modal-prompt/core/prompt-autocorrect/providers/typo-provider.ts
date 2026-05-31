/**
 * prompt-autocorrect/providers/typo-provider.ts
 *
 * Proveedor de corrección ortográfica usando Typo.js (Capa 1 - offline y rápida).
 *
 * Este archivo es un placeholder.
 * La implementación real se basará en el SpellCheckService de ./analizar/
 */

export interface TypoProviderOptions {
  language: string;
  dictionariesBaseUrl?: string;
}

// Placeholder - no implementar lógica todavía
export async function checkWithTypo(text: string, options: TypoProviderOptions): Promise<any[]> {
  // TODO: Integrar typo-js + diccionarios Hunspell
  return [];
}
