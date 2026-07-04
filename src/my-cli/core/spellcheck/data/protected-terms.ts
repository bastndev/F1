export const PROTECTED_TERMS = new Set<string>([
	// Word
	'analizalo', 'banderitas', 'voice-tts', 'voice tts', 'play', 'cositas','autorizacion','automaticamente', 'telemetria', 'especificamente', 'inspirate',	'susténtalo', 'sustentalo', 'redireccionará', 'mobile', 'footer', 'header', 'link', 'mejoralo', 'blur', 'revisalo', 'vistaz', 'peru', 'links', 'google translate', 'dev', 'Mejorame', 'google', 'scroll', 'translate', 'hover', 'copy','Smart', 'hagamoslo', 'agregame', 'cajita', 'keymaps', 'mejorame', 'hover', 'confirmame','reset', 'design', 'full','shit','rojito','skeleton', 'styles', 'neserio','implementalo', 'previsualiza', 'bolita','bugs', 'diferenciacion', 'markdown','solucionalo','src', 'end', 'refactor', 'middle', 'pelin','agranda ','agrandalo','ram','low',

	// Frameworks & libraries
	'react', 'vue', 'angular', 'svelte', 'solid', 'nextjs', 'nuxt', 'astro', 'remix',
	'zustand', 'redux', 'jotai', 'recoil', 'valtio', 'tanstack', 'swr',
	'express', 'fastify', 'nestjs', 'hono', 'prisma', 'trpc',
	'vite', 'webpack', 'esbuild', 'rollup', 'turbo', 'pnpm', 'bun', 'deno',
	'typescript', 'javascript', 'node', 'nodejs', 'tsx', 'jsx', 'esm', 'cjs',
	'vitest', 'jest', 'cypress', 'playwright', 'storybook',
	'tailwind', 'shadcn', 'radix', 'framer', 'gsap', 'threejs',
	'zod', 'yup', 'drizzle', 'mongoose', 'sequelize', 'typeorm',
	'socket', 'axios', 'fetch', 'cors', 'jwt', 'oauth',

	// CLI Hub agents and local product terms
	'f1', 'mycli', 'opencode', 'codex', 'claude', 'claudecode', 'copilot',
	'antigravity', 'grok', 'kiro', 'kilo', 'kilocode',
	'pty', 'xterm', 'webview', 'vscode', 'cursor', 'windsurf', 'trae',

	// Tools & platforms
	'github', 'gitlab', 'bitbucket', 'docker', 'kubernetes', 'k8s',
	'vercel', 'netlify', 'supabase', 'firebase', 'appwrite', 'planetscale', 'neon',
	'aws', 'gcp', 'azure', 'cloudflare', 'railway', 'render', 'fly',
	'linux', 'ubuntu', 'macos', 'windows', 'bash', 'zsh', 'fish', 'powershell',
	'git', 'npm', 'npx', 'yarn', 'pnpm', 'bunx', 'brew', 'apt',

	// Languages
	'python', 'rust', 'golang', 'java', 'kotlin', 'swift', 'cpp', 'csharp',
	'php', 'ruby', 'elixir', 'haskell', 'lua', 'scala', 'spanish', 'english',

	// Common technical terms
	'api', 'ui', 'ux', 'cli', 'sdk', 'cdn', 'sql', 'nosql', 'graphql', 'rest',
	'http', 'https', 'websocket', 'db', 'orm', 'ssr', 'ssg', 'csr', 'spa',
	'ci', 'cd', 'devops', 'env', 'dotenv', 'config', 'schema', 'migration', 'seed',
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
	'json', 'yaml', 'toml', 'xml', 'csv', 'html', 'css', 'scss', 'sass', 'md', 'mdx',
	'ts', 'js', 'mjs', 'cjs', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp',
	'dom', 'csp', 'ipc', 'iife', 'uuid', 'regex', 'regexp',
	'string', 'number', 'boolean', 'null', 'undefined', 'void', 'never',
	'array', 'object', 'map', 'set', 'record', 'tuple', 'enum', 'type', 'interface',
	'class', 'function', 'const', 'let', 'var', 'import', 'export', 'default',
	'return', 'throw', 'try', 'catch', 'finally', 'switch', 'case', 'break',

	// Local technical terms that should not be over-corrected by the dictionary.
	'autocorrect', 'typo', 'lynxjs', 'testear', 'codigo', 'prompt', 'code', 'bug', 'palito', 'mouse', 'click', 'harry', 'potter', 'ctrl','enter' , 'alt', 'skills', 'skill', '.agents', 'agents','prompts', 'refactorizacion', 'tokens','toggle', 'claude' , 'fixnow','package'
]);

export function isProtectedTerm(word: string): boolean {
	return PROTECTED_TERMS.has(word.toLowerCase());
}

export function shouldProtectWord(word: string): boolean {
	if (!word) {
		return true;
	}

	if (isProtectedTerm(word)) {
		return true;
	}

	if (/[0-9_$]/.test(word)) {
		return true;
	}

	if (isAcronym(word) || hasInternalCapital(word)) {
		return true;
	}

	return false;
}

function isAcronym(word: string): boolean {
	return word.length > 1 && word.length <= 10 && word === word.toUpperCase() && /[A-Z]/.test(word);
}

function hasInternalCapital(word: string): boolean {
	return /[a-záéíóúüñ][A-ZÁÉÍÓÚÜÑ]/.test(word) || /[A-ZÁÉÍÓÚÜÑ].*[A-ZÁÉÍÓÚÜÑ]/.test(word);
}
