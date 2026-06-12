import type { CategoryDefinition } from './types';
import { webMeta } from './01-web/meta';
import { webTechnologies } from './01-web/technologies';
import { webSignals } from './01-web/signals';
import { webRelations } from './01-web/relations';
import { mobileMeta } from './02-mobile/meta';
import { mobileTechnologies } from './02-mobile/technologies';
import { mobileSignals } from './02-mobile/signals';
import { mobileRelations } from './02-mobile/relations';
import { backendMeta } from './03-backend/meta';
import { backendTechnologies } from './03-backend/technologies';
import { backendSignals } from './03-backend/signals';
import { backendRelations } from './03-backend/relations';
import { uiUxMeta } from './04-ui-ux/meta';
import { uiUxTechnologies } from './04-ui-ux/technologies';
import { uiUxSignals } from './04-ui-ux/signals';
import { uiUxRelations } from './04-ui-ux/relations';
import { aiMeta } from './05-ai/meta';
import { aiTechnologies } from './05-ai/technologies';
import { aiSignals } from './05-ai/signals';
import { aiRelations } from './05-ai/relations';
import { testingMeta } from './06-testing/meta';
import { testingTechnologies } from './06-testing/technologies';
import { testingSignals } from './06-testing/signals';
import { testingRelations } from './06-testing/relations';
import { securityMeta } from './07-security/meta';
import { securityTechnologies } from './07-security/technologies';
import { securitySignals } from './07-security/signals';
import { securityRelations } from './07-security/relations';
import { databaseMeta } from './08-database/meta';
import { databaseTechnologies } from './08-database/technologies';
import { databaseSignals } from './08-database/signals';
import { databaseRelations } from './08-database/relations';

function defineCategory(
	meta: CategoryDefinition,
	aliases: string[],
): CategoryDefinition {
	return {
		...meta,
		aliases,
	};
}

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
	defineCategory({ ...webMeta, aliases: [], technologies: webTechnologies, relations: webRelations }, webSignals),
	defineCategory({ ...mobileMeta, aliases: [], technologies: mobileTechnologies, relations: mobileRelations }, mobileSignals),
	defineCategory({ ...backendMeta, aliases: [], technologies: backendTechnologies, relations: backendRelations }, backendSignals),
	defineCategory({ ...uiUxMeta, aliases: [], technologies: uiUxTechnologies, relations: uiUxRelations }, uiUxSignals),
	defineCategory({ ...aiMeta, aliases: [], technologies: aiTechnologies, relations: aiRelations }, aiSignals),
	defineCategory({ ...testingMeta, aliases: [], technologies: testingTechnologies, relations: testingRelations }, testingSignals),
	defineCategory({ ...securityMeta, aliases: [], technologies: securityTechnologies, relations: securityRelations }, securitySignals),
	defineCategory({ ...databaseMeta, aliases: [], technologies: databaseTechnologies, relations: databaseRelations }, databaseSignals),
];

export const CATEGORY_BY_ID = new Map(CATEGORY_DEFINITIONS.map(category => [category.id, category]));
