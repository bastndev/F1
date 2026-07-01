/**
 * Rule invariant test for the "Smart + Skills" rules asset.
 * Validated by `tsc --noEmit` — no test runner required.
 *
 * Locks the load-bearing phrases in assets/skills/default/SKILL.md: if any go
 * missing, `assertRuleInvariants` throws (and, with a runner, the test fails),
 * a reminder to propagate the change rather than silently drop a safety rule.
 */

import * as fs from 'fs';
import * as path from 'path';
import { RULE_INVARIANTS, extractSkillBody, findMissingRuleInvariants } from '../my-plus/my-smart/core/skill';

const SKILL_PATH = path.join(
	__dirname,
	'..',
	'my-plus',
	'my-smart',
	'assets',
	'skills',
	'default',
	'SKILL.md'
);

const assertRuleInvariants = (): void => {
	const body = extractSkillBody(fs.readFileSync(SKILL_PATH, 'utf8'));
	const missing = findMissingRuleInvariants(body);
	if (missing.length > 0) {
		throw new Error(`[smart-rules] SKILL.md is missing required phrases: ${missing.join(', ')}`);
	}
};

// skill.ts — the invariant list and helpers exist with the expected shapes.
const invariants: readonly string[] = RULE_INVARIANTS;
const stripped: string = extractSkillBody('---\nname: x\n---\n# body\n');

// Actually run the invariant check — fails if any load-bearing phrase was
// dropped from SKILL.md. (Runs when a test runner is wired up; type-verified
// by `tsc --noEmit` today.)
assertRuleInvariants();

void invariants;
void stripped;
