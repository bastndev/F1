/**
 * Type-level smoke tests for my-skills.
 * Validated by `tsc --noEmit` — no test runner required.
 */

import type { InstallMarketplaceSkill, OfficialSkillSource } from '../my-skills/screens/install-skill/core/types';
import type { LocalSkill, LocalSkillKind } from '../my-skills/screens/local-skill/core/types';

// install-skill types — interfaces are usable
const skill: InstallMarketplaceSkill = {
	id: '1',
	skillId: 's1',
	name: 'test',
	installs: 0,
	source: 'marketplace',
};
const source: OfficialSkillSource = {
	id: 'o1',
	owner: 'test',
	displayName: 'Test',
	featuredRepo: 'repo',
	repoCount: 0,
	skillCount: 0,
	totalInstalls: null,
};

// local-skill types — interfaces are usable
const kind: LocalSkillKind = 'file';
const local: LocalSkill = {
	id: '1',
	name: 'test',
	source: '/path',
	kind,
	enabled: true,
	installedAt: Date.now(),
};

void skill;
void source;
void kind;
void local;
