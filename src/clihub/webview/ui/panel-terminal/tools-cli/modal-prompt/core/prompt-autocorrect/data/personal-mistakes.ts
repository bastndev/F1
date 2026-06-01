export const PERSONAL_MISTAKES: Record<string, string> = {
  // Common shorthand and abbreviations
  'ue': 'que',
  'eu': 'que',
  'ie': 'que',
  'q': 'que',
  'xq': 'porque',
  'x': 'por',
  'tb': 'también',
  'tmb': 'también',
  'k': 'que',
  'uiero': 'quiero',
  'Jifas': 'digas',
  // Adjacent key typos
  'camos': 'vamos',
  'coy': 'voy',
  'cienes': 'vienes',
  'cas': 'vas',
  // Fast-typing word merges and drops
  'quieroq': 'quiero que',
  'unneuvo': 'un nuevo',
  'contrlase': 'controlar las',
  'iamgne': 'imágenes',
  'uan': 'una',
  'asets': 'assets',
  'analzia': 'analiza',
  'fallas orograficas': 'fallas ortográficas',
  'entrraremos': 'entrenaremos',
  'hi': 'ahí',
  'mellamo': 'me llamo',
  'muyrapido': 'muy rápido',
  // Add your most common personal mistakes here
};

/**
 * Apply personal writing patterns before any other correction layer.
 */
export function applyPersonalMistakes(text: string): string {
  let result = text;
  // Sort by length descending to avoid partial replacements
  const entries = Object.entries(PERSONAL_MISTAKES)
    .sort(([a], [b]) => b.length - a.length);
  for (const [mistake, correction] of entries) {
    // Use word boundaries to avoid replacing inside other words
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
