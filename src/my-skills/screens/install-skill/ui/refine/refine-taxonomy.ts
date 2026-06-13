export interface RefineNode {
	id: string;
	label: string;
	keywords: string[];
	children?: RefineNode[];
}

export const REFINE_TAXONOMY: RefineNode[] = [
	{
		id: 'web',
		label: 'Web',
		keywords: ['web', 'frontend', 'website', 'browser', 'html', 'css'],
		children: [
			{ id: 'web-framework', label: 'Frameworks', keywords: ['react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'remix', 'astro', 'sveltekit', 'gatsby'] },
			{ id: 'web-style', label: 'Styling', keywords: ['css', 'tailwind', 'sass', 'styled-components', 'design system', 'ui component'] },
			{ id: 'web-deploy', label: 'Deploy & Host', keywords: ['vercel', 'netlify', 'cloudflare', 'fly.io', 'render', 'railway', 'heroku'] },
			{ id: 'web-auth', label: 'Auth', keywords: ['auth', 'clerk', 'auth0', 'nextauth', 'supabase', 'login', 'oauth', 'jwt'] },
			{ id: 'web-cms', label: 'CMS', keywords: ['cms', 'contentful', 'strapi', 'sanity', 'wordpress', 'headless'] },
			{ id: 'web-state', label: 'State', keywords: ['redux', 'zustand', 'jotai', 'recoil', 'mobx', 'pinia', 'state management'] },
			{ id: 'web-access', label: 'Accessibility', keywords: ['a11y', 'accessibility', 'wcag', 'aria', 'screen reader'] },
		],
	},
	{
		id: 'backend',
		label: 'Backend',
		keywords: ['backend', 'server', 'api', 'rest', 'graphql', 'database'],
		children: [
			{ id: 'be-lang', label: 'Runtimes', keywords: ['node.js', 'deno', 'bun', 'python', 'go', 'rust', 'ruby', 'php', 'java', 'c#'] },
			{ id: 'be-framework', label: 'Frameworks', keywords: ['express', 'fastify', 'hono', 'django', 'flask', 'fastapi', 'laravel', 'spring', 'rails'] },
			{ id: 'be-db', label: 'Databases', keywords: ['postgres', 'mysql', 'mongodb', 'sqlite', 'redis', 'prisma', 'drizzle', 'orm', 'sql'] },
			{ id: 'be-api', label: 'API Design', keywords: ['graphql', 'trpc', 'openapi', 'swagger', 'grpc', 'soap', 'rest api'] },
			{ id: 'be-mq', label: 'Messaging', keywords: ['rabbitmq', 'kafka', 'redis pub sub', 'sqs', 'nats', 'webhook', 'event driven'] },
		],
	},
	{
		id: 'mobile',
		label: 'Mobile',
		keywords: ['mobile', 'ios', 'android', 'app', 'react native', 'flutter'],
		children: [
			{ id: 'mob-rn', label: 'React Native', keywords: ['react native', 'expo', 'rn', 'tamagui'] },
			{ id: 'mob-flutter', label: 'Flutter', keywords: ['flutter', 'dart'] },
			{ id: 'mob-swift', label: 'iOS / Swift', keywords: ['swift', 'swiftui', 'uikit', 'xcode', 'ios'] },
			{ id: 'mob-kotlin', label: 'Android / Kotlin', keywords: ['kotlin', 'jetpack compose', 'android', 'gradle'] },
			{ id: 'mob-cross', label: 'Cross-Platform', keywords: ['capacitor', 'ionic', 'tauri', 'kotlin multiplatform', 'pwa'] },
		],
	},
	{
		id: 'ai',
		label: 'AI / ML',
		keywords: ['ai', 'ml', 'llm', 'machine learning', 'artificial intelligence', 'gpt', 'openai'],
		children: [
			{ id: 'ai-llm', label: 'LLMs', keywords: ['openai', 'anthropic', 'claude', 'gemini', 'llama', 'mistral', 'gpt', 'chatgpt'] },
			{ id: 'ai-agents', label: 'Agents', keywords: ['agent', 'langchain', 'crewai', 'autogen', 'cognition', 'tools'] },
			{ id: 'ai-rag', label: 'RAG & Vector', keywords: ['rag', 'vector', 'embedding', 'pinecone', 'chroma', 'weaviate', 'qdrant'] },
			{ id: 'ai-mlops', label: 'MLOps', keywords: ['mlflow', 'wandb', 'tensorboard', 'kubeflow', 'training', 'inference'] },
			{ id: 'ai-vision', label: 'Vision', keywords: ['computer vision', 'ocr', 'image recognition', 'object detection', 'stable diffusion'] },
			{ id: 'ai-prompt', label: 'Prompting', keywords: ['prompt', 'few shot', 'chain of thought', 'system prompt', 'instruction'] },
		],
	},
	{
		id: 'security',
		label: 'Security',
		keywords: ['security', 'vulnerability', 'encryption', 'pentest', 'owasp'],
		children: [
			{ id: 'sec-auth', label: 'Auth & Identity', keywords: ['oauth', 'jwt', 'saml', 'openid', 'ldap', 'mfa', 'passkeys'] },
			{ id: 'sec-scan', label: 'Scanning', keywords: ['sast', 'dast', 'dependency scan', 'sbom', 'semgrep', 'sonarqube', 'snyk'] },
			{ id: 'sec-infra', label: 'Infra Security', keywords: ['waf', 'firewall', 'iam', 'vault', 'secret management', 'tls', 'ssl'] },
			{ id: 'sec-compliance', label: 'Compliance', keywords: ['soc2', 'gdpr', 'hipaa', 'pci', 'iso27001', 'audit'] },
		],
	},
	{
		id: 'devops',
		label: 'DevOps',
		keywords: ['devops', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'pipeline'],
		children: [
			{ id: 'ops-cicd', label: 'CI/CD', keywords: ['github actions', 'gitlab ci', 'jenkins', 'circleci', 'buildkite', 'argo'] },
			{ id: 'ops-container', label: 'Containers', keywords: ['docker', 'kubernetes', 'k8s', 'helm', 'podman', 'containerd', 'compose'] },
			{ id: 'ops-iac', label: 'Infra as Code', keywords: ['terraform', 'pulumi', 'ansible', 'cloudformation', 'puppet', 'chef'] },
			{ id: 'ops-observ', label: 'Observability', keywords: ['monitoring', 'logging', 'tracing', 'prometheus', 'grafana', 'datadog', 'opentelemetry'] },
			{ id: 'ops-config', label: 'Config', keywords: ['dotenv', 'config', 'feature flags', 'launchdarkly', 'unleash'] },
		],
	},
	{
		id: 'data',
		label: 'Data',
		keywords: ['data', 'analytics', 'etl', 'big data', 'pipeline', 'warehouse'],
		children: [
			{ id: 'data-eng', label: 'Engineering', keywords: ['spark', 'airflow', 'dbt', 'kafka', 'flink', 'debezium', 'data pipeline'] },
			{ id: 'data-warehouse', label: 'Warehousing', keywords: ['snowflake', 'bigquery', 'redshift', 'clickhouse', 'duckdb', 'databricks'] },
			{ id: 'data-viz', label: 'Visualization', keywords: ['metabase', 'looker', 'tableau', 'superset', 'preset', 'd3'] },
			{ id: 'data-storage', label: 'Storage', keywords: ['s3', 'minio', 'lake', 'iceberg', 'parquet', 'delta lake'] },
		],
	},
	{
		id: 'testing',
		label: 'Testing',
		keywords: ['testing', 'test', 'e2e', 'unit test', 'integration test'],
		children: [
			{ id: 'test-unit', label: 'Unit', keywords: ['jest', 'vitest', 'mocha', 'pytest', 'rspec', 'junit'] },
			{ id: 'test-e2e', label: 'E2E', keywords: ['playwright', 'cypress', 'selenium', 'puppeteer', 'webdriver'] },
			{ id: 'test-component', label: 'Component', keywords: ['testing library', 'storybook', 'chromatic', 'percy'] },
			{ id: 'test-perf', label: 'Performance', keywords: ['lighthouse', 'k6', 'jmeter', 'load testing', 'benchmark'] },
		],
	},
	{
		id: 'productivity',
		label: 'Productivity',
		keywords: ['productivity', 'tools', 'workflow', 'automation', 'developer experience'],
		children: [
			{ id: 'prod-ide', label: 'IDE & Editor', keywords: ['vscode', 'jetbrains', 'neovim', 'emacs', 'extension', 'plugin'] },
			{ id: 'prod-git', label: 'Git & Code', keywords: ['git', 'github', 'gitlab', 'bitbucket', 'code review', 'pull request'] },
			{ id: 'prod-docs', label: 'Documentation', keywords: ['docs', 'documentation', 'readme', 'mdx', 'api docs', 'storybook'] },
			{ id: 'prod-automation', label: 'Automation', keywords: ['n8n', 'zapier', 'make', 'workflow', 'scripting', 'cli tool'] },
		],
	},
	{
		id: 'cloud',
		label: 'Cloud',
		keywords: ['cloud', 'aws', 'gcp', 'azure', 'serverless', 'lambda'],
		children: [
			{ id: 'cloud-aws', label: 'AWS', keywords: ['aws', 'lambda', 's3', 'dynamodb', 'ecs', 'rds', 'cloudfront'] },
			{ id: 'cloud-gcp', label: 'GCP', keywords: ['gcp', 'google cloud', 'cloud run', 'firebase', 'bigquery', 'cloud functions'] },
			{ id: 'cloud-azure', label: 'Azure', keywords: ['azure', 'azure functions', 'cosmos db', 'devops', 'entra'] },
			{ id: 'cloud-serverless', label: 'Serverless', keywords: ['serverless', 'lambda', 'cloudflare workers', 'edge functions'] },
		],
	},
];
