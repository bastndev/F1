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
  'xplico': 'explico',
  // Adjacent key typos
  'camos': 'vamos',
  'coy': 'voy',
  'cienes': 'vienes',
  'cas': 'vas',
  'alga': 'salga',
  'sio': 'sí',
  'favco': 'favor',
  'busno': 'bueno',
  'poer': 'pero',
  'speas': 'sepas',
  'iprota': 'importa',
  'gustwaria': 'gustaría',
  'protafolio': 'portafolio',
  'buente': 'bueno',
  'improtante': 'importante',
  'pieso': 'pienso',
  'simpre': 'siempre',
  'paresare': 'pasaré',
  'enepsar': 'empezar',
  'escalabe': 'escalable',
  'mantible': 'mantenible',
  'ahirta': 'ahora',
  'habalndo': 'hablando',
  'segudno': 'segundo',
  'segudnos': 'segundos',
  'segundoass': 'segundos',
  'domora': 'demora',
  'preciono': 'presiono',
  // Fast-typing word merges and drops
  'quieroq': 'quiero que',
  'unneuvo': 'un nuevo',
  'contrlase': 'controlar las',
  'iamgne': 'imágenes',
  'uan': 'una',
  'asets': 'assets',
  'analzia': 'analiza',
  'fallas orograficas': 'fallas ortográficas',
  'fallas orotgraficas': 'fallas ortográficas',
  'entrraremos': 'entrenaremos',
  'hi': 'ahí',
  'mellamo': 'me llamo',
  'muyrapido': 'muy rápido',
  'elcodigo': 'el código',
  'enel': 'en el',
  'nocreo': 'no creo',
  'porahora': 'por ahora',
  'naimacion': 'animación',
  'elinformea': 'el informe',
  'elinforma': 'el informe',
  'loq': 'lo que',
  'loq estama': 'lo que tenemos',
  'desun': 'dé un',
  'infrome': 'informe',
  'quietectua': 'arquitectura',
  'merjora': 'mejorar',
  'queiro': 'quiero',
  // Transposition errors
  'loguica': 'lógica',
  'ideoma': 'idioma',
  'priemro': 'primero',
  'enpesar': 'empezar',
  'enpecemos': 'empecemos',
  'enpiezo': 'empiezo',
  'enpoieco': 'empiezo',
  'precionando': 'presionando',
  'precione': 'presione',
  'implentaste': 'implementaste',
  'letnop': 'lento',
  'ortograia': 'ortografía',
  'orotgraficas': 'ortográficas',
  'orografuicas': 'ortográficas',
  'progrmacion': 'programación',
  'progrmadore': 'programadores',
  'sespecidficamente': 'específicamente',
  'palabrqas': 'palabras',
  // Spelling errors
  'nesesario': 'necesario',
  'posivilidad': 'posibilidad',
  'sujeries': 'sugerencias',
  'sujerencias': 'sugerencias',
  'elejir': 'elegir',
  'tradusca': 'traduzca',
  'verda': 'verdad',
  'smejor': 'mejor',
  'agranda': 'agrandar',
  'conoes': 'conoces',
  'emnos': 'menos',
  
  // Add MORE:
  'mla': 'la',
  'codigo': 'codigo',
  'ais': 'a si',
  'mejroa': 'mejorar',
  'manrea': 'manera',
  'aoptimiza': 'optimizar',
  'vuiero': 'quiero',

};

/**
 * Apply personal writing patterns before any other correction layer.
 * Handles both single-word and multi-word patterns sorted by length
 * to avoid partial replacements.
 */
export function applyPersonalMistakes(text: string): string {
  let result = text;

  // Sort by length descending to avoid partial replacements
  // (multi-word patterns like 'quieroq ue' must run before 'quieroq')
  const entries = Object.entries(PERSONAL_MISTAKES)
    .sort(([a], [b]) => b.length - a.length);

  for (const [mistake, correction] of entries) {
    const escaped = escapeRegExp(mistake);
    // Multi-word patterns: match as-is (spaces included)
    // Single-word patterns: use word boundaries
    const pattern = mistake.includes(' ')
      ? new RegExp(escaped, 'gi')
      : new RegExp(`\\b${escaped}\\b`, 'gi');

    result = result.replace(pattern, (match) => preserveCase(match, correction));
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
