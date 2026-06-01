export const PROTECTED_TERMS = new Set<string>([
  // Frameworks & libraries
  'react', 'vue', 'angular', 'svelte', 'solid', 'nextjs', 'nuxt', 'astro', 'remix',
  'zustand', 'redux', 'jotai', 'recoil', 'valtio', 'tanstack', 'swr',
  'express', 'fastify', 'nestjs', 'hono', 'prisma', 'trpc',
  'vite', 'webpack', 'esbuild', 'rollup', 'turbo', 'pnpm', 'bun', 'deno',
  'typescript', 'javascript', 'tsx', 'jsx', 'esm', 'cjs',
  'vitest', 'jest', 'cypress', 'playwright', 'storybook',
  'tailwind', 'shadcn', 'radix', 'framer', 'gsap', 'threejs',
  'zod', 'yup', 'drizzle', 'mongoose', 'sequelize', 'typeorm',
  'socket', 'axios', 'fetch', 'cors', 'jwt', 'oauth',
  // Tools & platforms
  'vscode', 'cursor', 'github', 'gitlab', 'bitbucket', 'docker', 'kubernetes', 'k8s',
  'vercel', 'netlify', 'supabase', 'firebase', 'appwrite', 'planetscale', 'neon',
  'aws', 'gcp', 'azure', 'cloudflare', 'railway', 'render', 'fly',
  'linux', 'ubuntu', 'macos', 'windows', 'bash', 'zsh', 'powershell',
  'git', 'npm', 'yarn', 'brew', 'apt',
  // Languages
  'python', 'rust', 'golang', 'java', 'kotlin', 'swift', 'cpp', 'csharp',
  'php', 'ruby', 'elixir', 'haskell', 'lua', 'scala',
  // Common technical terms
  'api', 'ui', 'ux', 'cli', 'sdk', 'cdn', 'sql', 'nosql', 'graphql', 'rest',
  'http', 'https', 'websocket', 'db', 'orm', 'ssr', 'ssg', 'csr', 'spa',
  'ci', 'cd', 'devops', 'env', 'config', 'schema', 'migration', 'seed',
  'frontend', 'backend', 'fullstack', 'monorepo', 'microservices',
  'token', 'cookie', 'session', 'cache', 'queue', 'cron', 'webhook',
  'payload', 'endpoint', 'middleware', 'handler', 'callback', 'promise',
  'async', 'await', 'props', 'state', 'hook', 'context', 'ref', 'memo',
  'store', 'action', 'reducer', 'selector', 'effect', 'computed',
  'component', 'layout', 'page', 'route', 'router', 'params', 'query',
  'modal', 'toast', 'drawer', 'tooltip', 'dropdown', 'sidebar', 'navbar',
  'input', 'form', 'button', 'table', 'card', 'badge', 'avatar',
  'theme', 'darkmode', 'lightmode', 'breakpoint', 'responsive',
  'deploy', 'build', 'bundle', 'chunk', 'tree', 'shaking', 'minify',
  'lint', 'format', 'prettier', 'eslint', 'biome', 'husky',
  'debug', 'log', 'error', 'warning', 'trace', 'stack',
  'repo', 'branch', 'commit', 'push', 'pull', 'merge', 'rebase', 'fork',
  'issue', 'pr', 'review', 'release', 'tag', 'changelog',
  'readme', 'license', 'gitignore', 'dockerfile', 'compose',
  'port', 'host', 'proxy', 'ssl', 'tls', 'dns', 'ip', 'url', 'uri',
  'json', 'yaml', 'toml', 'xml', 'csv', 'md', 'mdx', 'env',
  'string', 'number', 'boolean', 'null', 'undefined', 'void', 'never',
  'array', 'object', 'map', 'set', 'record', 'tuple', 'enum', 'type', 'interface',
  'class', 'function', 'const', 'let', 'var', 'import', 'export', 'default',
  'return', 'throw', 'try', 'catch', 'finally', 'switch', 'case', 'break',
  // Personal technical terms
  'codigo', 'webview', 'clihub', 'autocorrect', 'typo',
]);

export function isProtectedTerm(word: string): boolean {
  return PROTECTED_TERMS.has(word.toLowerCase());
}