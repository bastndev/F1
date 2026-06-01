export const PROTECTED_TERMS = new Set<string>([
  // Frameworks & libraries
  'react', 'vue', 'angular', 'svelte', 'solid', 'nextjs', 'nuxt', 'astro', 'remix',
  'zustand', 'redux', 'jotai', 'recoil', 'valtio', 'tanstack', 'swr',
  'express', 'fastify', 'nestjs', 'hono', 'prisma', 'trpc',
  'vite', 'webpack', 'esbuild', 'rollup', 'turbo', 'pnpm',
  'typescript', 'javascript', 'tsx', 'jsx',
  'vitest', 'jest', 'cypress', 'playwright',

  // Tools & platforms
  'vscode', 'cursor', 'github', 'gitlab', 'docker', 'kubernetes',
  'vercel', 'netlify', 'supabase', 'firebase', 'aws', 'cloudflare',

  // Common technical terms
  'api', 'ui', 'ux', 'cli', 'sdk', 'cdn', 'sql', 'nosql', 'graphql', 'rest',
  'http', 'https', 'websocket', 'db',

  // Add your personal technical terms here
]);

export function isProtectedTerm(word: string): boolean {
  return PROTECTED_TERMS.has(word.toLowerCase());
}
