import type { SkillVariantOption } from '../types';

export const securityVariants: SkillVariantOption[] = [
	{ id: 'auth-security', label: 'Auth Security', categoryId: 'security', aliases: ['auth', 'authentication', 'login'], searchTerms: ['auth security'], facets: ['identity'], weight: 94 },
	{ id: 'oauth-security', label: 'OAuth', categoryId: 'security', aliases: ['oauth', 'oauth2', 'oidc'], searchTerms: ['oauth'], facets: ['identity'], weight: 90 },
	{ id: 'secrets-security', label: 'Secrets', categoryId: 'security', aliases: ['secrets', 'env', 'credentials'], searchTerms: ['secrets security'], facets: ['credentials'], weight: 86 },
	{ id: 'owasp-review', label: 'OWASP Review', categoryId: 'security', aliases: ['owasp', 'audit', 'review'], searchTerms: ['owasp'], facets: ['audit'], weight: 84 },
	{ id: 'api-security', label: 'API Security', categoryId: 'security', aliases: ['api', 'endpoint', 'backend'], searchTerms: ['api security'], facets: ['api'], weight: 78 },
	{ id: 'encryption-security', label: 'Encryption', categoryId: 'security', aliases: ['encryption', 'crypto'], searchTerms: ['encryption'], facets: ['crypto'], weight: 72 },
];

