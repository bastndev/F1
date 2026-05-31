/**
 * prompt-autocorrect/index.ts
 *
 * Punto de entrada público del módulo de autocorrección.
 * Re-exporta la API limpia que usará prompt-processor.ts
 */

export * from './types';
export { getAutocorrectService, AutocorrectService } from './autocorrect-service';

// TODO: Exportar función de alto nivel cuando esté lista
// export { autocorrectText } from './autocorrect-service';
