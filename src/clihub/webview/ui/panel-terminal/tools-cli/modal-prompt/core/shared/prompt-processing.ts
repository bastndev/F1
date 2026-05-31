/**
 * core/shared/prompt-processing.ts
 *
 * Tipos y utilidades compartidas entre prompt-autocorrect y prompt-translate.
 *
 * Útil para mantener consistencia en el pipeline de procesamiento.
 */

export interface ProcessingStep {
  name: 'autocorrect' | 'translate' | 'other';
  durationMs?: number;
  success: boolean;
}

export interface PromptProcessingMetadata {
  originalLength: number;
  finalLength: number;
  steps: ProcessingStep[];
  totalDurationMs?: number;
}

// TODO: Interfaces compartidas irán aquí cuando se desarrolle el pipeline completo.
