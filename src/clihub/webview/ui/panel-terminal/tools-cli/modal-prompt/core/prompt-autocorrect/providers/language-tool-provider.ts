/**
 * prompt-autocorrect/providers/language-tool-provider.ts
 *
 * Proveedor de corrección gramatical y de estilo usando LanguageTool API (Capa 2).
 *
 * Este archivo es un placeholder.
 * Basado en la integración de LanguageTool del proyecto ./analizar/
 */

export interface LanguageToolProviderOptions {
  language: string;
  apiUrl?: string;
  timeoutMs?: number;
}

// Placeholder - no implementar lógica todavía
export async function checkWithLanguageTool(
  text: string,
  options: LanguageToolProviderOptions
): Promise<any[]> {
  // TODO: Llamada a LanguageTool + debounce + merge de errores
  return [];
}
