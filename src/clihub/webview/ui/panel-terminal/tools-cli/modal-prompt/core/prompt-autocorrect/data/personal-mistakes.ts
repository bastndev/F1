export const PERSONAL_MISTAKES: Record<string, string> = {
  // Common words you tend to mistype when writing fast
  'ue': 'que',
  'eu': 'que',
  'q': 'que',
  'xq': 'porque',
  'x': 'por',
  'tb': 'también',
  'tmb': 'también',
  'k': 'que',

  // Frequent typing errors (adjacent keys)
  'camos': 'vamos',
  'coy': 'voy',
  'cienes': 'vienes',
  'cas': 'vas',

  // 'mellamo': 'me llamo',
  // 'muyrapido': 'muy rápido',
  // Add your most common personal mistakes here
};

/**
 * Apply personal writing patterns before any other layer.
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
