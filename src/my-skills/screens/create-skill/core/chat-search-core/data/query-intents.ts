export type QueryIntentId =
	| 'deployment'
	| 'testing'
	| 'design'
	| 'mobile'
	| 'database'
	| 'backend'
	| 'security'
	| 'performance'
	| 'frontend'
	| 'ai'
	| 'vscode'
	| 'refactor'
	| 'code-quality'
	| 'docs'
	| 'search'
	| 'localization';

export interface QueryIntentRule {
	id: QueryIntentId;
	patterns: RegExp[];
	searchTerms: string[];
}

export const QUERY_INTENT_RULES: QueryIntentRule[] = [
	{
		id: 'deployment',
		patterns: [
			/deploy|deployment|deployar|despliegue|desplegar|despegar|producci[oó]n|producion|production|prod\b|publish|publicar|hosting|hostear|vercel|netlify|cloudflare|railway|render|fly\.io|部署/iu,
		],
		searchTerms: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	},
	{
		id: 'testing',
		patterns: [/pruebas?|tests?|testing|e2e|unit|测试|測試/iu],
		searchTerms: ['testing', 'playwright', 'vitest'],
	},
	{
		id: 'design',
		patterns: [/interfaz|diseñ|design|(?:^|[^\p{L}\p{N}])(?:ui|ux)(?:$|[^\p{L}\p{N}])|accessibility|accesibilidad|界面|設計|设计/iu],
		searchTerms: ['design', 'ui', 'accessibility'],
	},
	{
		id: 'mobile',
		patterns: [/m[oó]vil|mobile|android|ios|flutter|react\s+native|expo|移动|移動/iu],
		searchTerms: ['mobile', 'expo', 'react native', 'flutter'],
	},
	{
		id: 'database',
		patterns: [/base\s+de\s+datos|database|db\b|postgres|mysql|sqlite|prisma|supabase|数据库|資料庫/iu],
		searchTerms: ['database', 'prisma', 'supabase', 'postgres'],
	},
	{
		id: 'backend',
		patterns: [/(?:^|[^\p{L}\p{N}])api(?:$|[^\p{L}\p{N}])|backend|servidor|server|node|fastapi|hono|express|nestjs|后端|後端/iu],
		searchTerms: ['backend', 'api', 'nodejs', 'fastapi'],
	},
	{
		id: 'security',
		patterns: [/seguridad|security|auth|login|jwt|oauth|认证|認證|安全/iu],
		searchTerms: ['security', 'auth', 'login'],
	},
	{
		id: 'performance',
		patterns: [/performance|rendimiento|perf|optimiza|optimize|性能/iu],
		searchTerms: ['performance', 'web perf'],
	},
	{
		id: 'frontend',
		patterns: [/frontend|front-end|react|nextjs|next\.js|vue|svelte|astro|vite|前端/iu],
		searchTerms: ['frontend', 'react', 'nextjs', 'vue'],
	},
	{
		id: 'ai',
		patterns: [/(?:^|[^\p{L}\p{N}])(?:ai|ia|llm|agent|agente)(?:$|[^\p{L}\p{N}])|人工智能/iu],
		searchTerms: ['ai', 'agent'],
	},
	{
		id: 'vscode',
		patterns: [/vs\s*code|vscode|visual\s+studio\s+code|extension\s+host|webview|activity\s+bar|sidebar|panel|extension\s+api/iu],
		searchTerms: ['vscode extension', 'webview', 'extension host'],
	},
	{
		id: 'refactor',
		patterns: [/refactor|refactorizar|architecture|arquitectura|cleanup|clean\s+up|limpiar|simplificar|simplify|reorganizar|dead\s+code|c[oó]digo\s+muerto/iu],
		searchTerms: ['refactor', 'architecture', 'best practices'],
	},
	{
		id: 'code-quality',
		patterns: [/code\s+quality|calidad\s+(?:del?\s+)?c[oó]digo|best\s+practices|lint|eslint|typecheck|typescript\s+types?|bugfix|bug\s+fix|fix\s+bugs?|robust|pulir|mejorar\s+l[oó]gica/iu],
		searchTerms: ['code quality', 'best practices', 'lint', 'typescript'],
	},
	{
		id: 'docs',
		patterns: [/docs?|documentation|documentaci[oó]n|documentar|readme|changelog|api\s+docs?|gu[ií]a|guide/iu],
		searchTerms: ['documentation', 'readme', 'api docs'],
	},
	{
		id: 'search',
		patterns: [/search|buscador|b[uú]squeda|buscar\s+(?:una?\s+)?skill|find\s+(?:a\s+)?skill|discover|discovery|recommend(?:er|ation)?|recomendador|recomendar/iu],
		searchTerms: ['skill discovery', 'search', 'recommendation'],
	},
	{
		id: 'localization',
		patterns: [/locali[sz]ation|localizaci[oó]n|i18n|idiomas?|translate|translation|traducir|traducci[oó]n/iu],
		searchTerms: ['localization', 'i18n', 'translation'],
	},
];

export const QUERY_KEYWORDS: Record<string, string[]> = {
	accessibility: ['design', 'ui'],
	accesibilidad: ['design', 'ui'],
	android: ['android', 'mobile'],
	api: ['backend', 'api', 'nodejs', 'fastapi'],
	astro: ['astro', 'frontend'],
	arquitectura: ['architecture', 'refactor', 'best practices'],
	architecture: ['architecture', 'refactor', 'best practices'],
	auth: ['security', 'auth', 'login'],
	autenticacion: ['security', 'auth', 'login'],
	'autenticación': ['security', 'auth', 'login'],
	backend: ['backend', 'api', 'nodejs', 'fastapi'],
	bun: ['bun'],
	buscador: ['search', 'recommendation', 'skill discovery'],
	busqueda: ['search', 'recommendation'],
	'búsqueda': ['search', 'recommendation'],
	cloudflare: ['cloudflare', 'deployment'],
	codequality: ['code quality', 'best practices'],
	database: ['database', 'prisma', 'supabase', 'postgres'],
	deploy: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	deployment: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	despegar: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	desplegar: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	despliegue: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	design: ['design', 'ui', 'accessibility'],
	diseño: ['design', 'ui', 'accessibility'],
	diseno: ['design', 'ui', 'accessibility'],
	docs: ['documentation', 'readme', 'api docs'],
	documentacion: ['documentation', 'readme', 'api docs'],
	'documentación': ['documentation', 'readme', 'api docs'],
	documentation: ['documentation', 'readme', 'api docs'],
	expo: ['expo', 'mobile'],
	fastapi: ['fastapi', 'python', 'backend'],
	flutter: ['flutter', 'mobile'],
	frontend: ['frontend', 'react', 'nextjs', 'vue'],
	i18n: ['localization', 'translation'],
	login: ['security', 'auth'],
	localizacion: ['localization', 'translation'],
	'localización': ['localization', 'translation'],
	logica: ['code quality', 'architecture'],
	'lógica': ['code quality', 'architecture'],
	mobile: ['mobile', 'expo', 'react native', 'flutter'],
	movil: ['mobile', 'expo', 'react native', 'flutter'],
	'móvil': ['mobile', 'expo', 'react native', 'flutter'],
	netlify: ['deployment', 'netlify'],
	next: ['nextjs', 'react'],
	nextjs: ['nextjs', 'react'],
	node: ['nodejs', 'backend'],
	nodejs: ['nodejs', 'backend'],
	performance: ['performance', 'web perf'],
	playwright: ['playwright', 'testing'],
	pulir: ['code quality', 'best practices'],
	prisma: ['prisma', 'database'],
	prod: ['deployment', 'production'],
	produccion: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	'producción': ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	producion: ['deployment', 'production', 'vercel', 'netlify', 'cloudflare'],
	python: ['python', 'backend'],
	react: ['react', 'frontend'],
	recomendador: ['search', 'recommendation', 'skill discovery'],
	recommendation: ['search', 'recommendation', 'skill discovery'],
	refactor: ['refactor', 'architecture', 'best practices'],
	refactorizar: ['refactor', 'architecture', 'best practices'],
	rendimiento: ['performance', 'web perf'],
	search: ['search', 'recommendation'],
	security: ['security', 'auth'],
	seguridad: ['security', 'auth'],
	supabase: ['supabase', 'database'],
	svelte: ['svelte', 'frontend'],
	tailwind: ['tailwind', 'design'],
	test: ['testing', 'playwright', 'vitest'],
	tests: ['testing', 'playwright', 'vitest'],
	testing: ['testing', 'playwright', 'vitest'],
	ts: ['typescript'],
	typescript: ['typescript'],
	ui: ['frontend', 'design', 'accessibility'],
	vscode: ['vscode extension', 'webview', 'extension host'],
	webview: ['vscode extension', 'webview'],
	vercel: ['deployment', 'vercel'],
	vite: ['vite', 'frontend'],
	vitest: ['vitest', 'testing'],
	vue: ['vue', 'frontend'],
	prueba: ['testing', 'playwright', 'vitest'],
	pruebas: ['testing', 'playwright', 'vitest'],
	测试: ['testing'],
	測試: ['testing'],
	界面: ['design', 'ui'],
	设计: ['design', 'ui'],
	設計: ['design', 'ui'],
	移动: ['mobile'],
	移動: ['mobile'],
	数据库: ['database'],
	資料庫: ['database'],
	后端: ['backend'],
	後端: ['backend'],
	部署: ['deployment', 'production'],
	性能: ['performance'],
	安全: ['security'],
	认证: ['security', 'auth'],
	認證: ['security', 'auth'],
	前端: ['frontend'],
};
