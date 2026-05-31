/**
 * prompt-autocorrect/utils.ts
 *
 * Utilidades puras para el módulo de autocorrección.
 * (Funciones de ayuda, normalización, etc.)
 *
 * Por ahora es un placeholder. No contiene lógica importante.
 */

export function normalizeLanguage(lang?: string): string {
  if (!lang || lang === 'auto') return 'es';
  return lang;
}

// TODO: Funciones de escape, protección de código, etc. irán aquí cuando se implemente.
