/**
 * protected-terms.ts
 * 
 * Palabras técnicas, marcas, frameworks, librerías, etc.
 * que NUNCA deben ser corregidas por el autocorrector.
 * 
 * Mantén este archivo actualizado. Agrega términos en minúscula.
 */

export const PROTECTED_TERMS = new Set<string>([
  // Frameworks y librerías
  'react', 'vue', 'angular', 'svelte', 'solid', 'nextjs', 'nuxt', 'astro', 'remix',
  'zustand', 'redux', 'jotai', 'recoil', 'valtio', 'tanstack', 'swr',
  'express', 'fastify', 'nestjs', 'hono', 'prisma', 'trpc',
  'vite', 'webpack', 'esbuild', 'rollup', 'turbo', 'pnpm',
  'typescript', 'javascript', 'tsx', 'jsx',
  'vitest', 'jest', 'cypress', 'playwright',

  // Herramientas y plataformas
  'vscode', 'cursor', 'github', 'gitlab', 'docker', 'kubernetes',
  'vercel', 'netlify', 'supabase', 'firebase', 'aws', 'cloudflare',

  // Términos técnicos comunes
  'api', 'ui', 'ux', 'cli', 'sdk', 'cdn', 'sql', 'nosql', 'graphql', 'rest',
  'http', 'https', 'websocket', 'db',

  // Agrega aquí tus palabras técnicas personales
]);

export function isProtectedTerm(word: string): boolean {
  return PROTECTED_TERMS.has(word.toLowerCase());
}
