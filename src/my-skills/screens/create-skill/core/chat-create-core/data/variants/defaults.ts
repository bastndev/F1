import type { CategoryId } from '../categories/types';

export const DEFAULT_VARIANT_LIMIT = 6;

export const DEFAULT_VARIANT_ORDER: Record<CategoryId, string[]> = {
	web: ['web-design', 'web-styles', 'react-ui', 'landing-ui', 'accessibility-ui', 'api-client-ui'],
	mobile: ['mobile-ui', 'mobile-animation', 'react-native-ui', 'flutter-ui', 'lynxjs-ui', 'mobile-forms'],
	backend: ['api-design', 'auth-backend', 'database-backend', 'node-backend', 'validation-backend', 'observability-backend'],
	'ui-ux': ['design-system', 'visual-polish', 'accessibility-review', 'layout-system', 'motion-design', 'figma-handoff'],
	ai: ['rag-workflow', 'agent-workflow', 'openai-integration', 'prompt-engineering', 'vector-search', 'ai-evals'],
	testing: ['e2e-testing', 'unit-testing', 'component-testing', 'api-testing', 'accessibility-testing', 'visual-regression'],
	security: ['auth-security', 'oauth-security', 'secrets-security', 'owasp-review', 'api-security', 'encryption-security'],
	database: ['database-schema', 'prisma-database', 'supabase-database', 'postgres-database', 'mongodb-database', 'database-migrations'],
};
