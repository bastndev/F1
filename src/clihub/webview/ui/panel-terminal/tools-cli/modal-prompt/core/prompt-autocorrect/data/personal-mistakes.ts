/**
 * personal-mistakes.ts
 * 
 * Errores frecuentes que tú cometes al escribir rápido.
 * Esta capa tiene la prioridad más alta.
 * 
 * Formato: "error_comun": "correccion"
 * 
 * Ejemplos basados en cómo escribes:
 */

export const PERSONAL_MISTAKES: Record<string, string> = {
  // Palabras comunes que unes o te equivocas al escribir rápido
  'ue': 'que',
  'q': 'que',
  'xq': 'porque',
  'x': 'por',
  'tb': 'también',
  'tmb': 'también',
  'k': 'que',

  // Errores frecuentes de tipeo (teclas cercanas)
  'camos': 'vamos',
  'coy': 'voy',
  'cienes': 'vienes',
  'cas': 'vas',

  // Ejemplos de tu estilo (agrega los que veas que se repiten)
  // 'mellamo': 'me llamo',
  // 'muyrapido': 'muy rápido',
  // 'crrejir': 'corregir',

  // Agrega aquí tus errores personales más comunes
};

/**
 * Aplica correcciones personales antes de cualquier otra capa.
 */
export function applyPersonalMistakes(text: string): string {
  let result = text;

  // Ordenamos por longitud descendente para evitar reemplazos parciales
  const entries = Object.entries(PERSONAL_MISTAKES)
    .sort(([a], [b]) => b.length - a.length);

  for (const [mistake, correction] of entries) {
    // Usamos word boundaries para no reemplazar dentro de otras palabras
    const regex = new RegExp(`\\b${escapeRegExp(mistake)}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      return preserveCase(match, correction);
    });
  }

  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
