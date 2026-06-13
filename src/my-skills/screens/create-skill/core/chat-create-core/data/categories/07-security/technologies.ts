import type { TechnologyOption } from '../types';

export const securityTechnologies: TechnologyOption[] = [
	{ id: 'auth', label: 'Auth', aliases: ['auth', 'authentication', 'login'], searchTerms: ['auth'], facets: ['identity'], weight: 92 },
	{ id: 'oauth', label: 'OAuth', aliases: ['oauth', 'oauth2', 'oidc'], searchTerms: ['oauth'], facets: ['identity'], weight: 88 },
	{ id: 'owasp', label: 'OWASP', aliases: ['owasp', 'security audit'], searchTerms: ['owasp'], facets: ['audit'], weight: 84 },
	{ id: 'secrets', label: 'Secrets', aliases: ['secrets', 'env', 'credentials'], searchTerms: ['secrets security'], facets: ['credentials'], weight: 78 },
	{ id: 'encryption', label: 'Encryption', aliases: ['encryption', 'crypto'], searchTerms: ['encryption'], facets: ['crypto'], weight: 72 },
	{ id: 'other', label: 'Other', aliases: ['other'], searchTerms: ['security'], facets: ['security'], weight: 1 },
];

