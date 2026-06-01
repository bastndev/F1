import { runFullAutocorrect } from './prompt-autocorrect-service';

/**
 * Corrección de dos capas (mejor de ambos mundos):
 * - Typo.js (ortografía)
 * - LanguageTool (gramática + contexto)
 *
 * Esta es la función recomendada para usar desde el botón "Corregir" y eventualmente desde el processor.
 */
export async function applyAutocorrect(text: string): Promise<string> {
	const result = await runFullAutocorrect(text);
	return result.correctedText;
}

// También exportamos la versión detallada por si en el futuro queremos mostrar estadísticas
export { runFullAutocorrect } from './prompt-autocorrect-service';

