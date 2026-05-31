/**
 * prompt-autocorrect/types.ts
 *
 * Tipos públicos para el módulo de corrección ortográfica/gramatical.
 * Basado en la arquitectura de dos capas (Typo.js + LanguageTool).
 *
 * Este archivo solo define contratos. No contiene lógica.
 */

export type Severity = 'spelling' | 'grammar' | 'style';

export interface Correction {
  original: string;
  replacement: string;
  offset: number;
  length: number;
  severity: Severity;
  message?: string;
  suggestions?: string[];
}

export interface AutocorrectOptions {
  language?: 'es' | 'en' | 'en-US' | 'auto';
  enableGrammar?: boolean; // activa LanguageTool (capa 2)
  aggressive?: boolean;    // futuro: aplicar sugerencias automáticamente
}

export interface AutocorrectResult {
  correctedText: string;
  corrections: Correction[];
  appliedCorrections: number;
}
