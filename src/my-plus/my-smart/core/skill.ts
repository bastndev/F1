/**
 * Helpers for the SKILL.md rules asset.
 *
 * Rules live in `assets/skills/default/SKILL.md` (YAML frontmatter + Markdown
 * body) as the single source of truth — editing it propagates on the next launch.
 * `extractSkillBody` drops the frontmatter so only the rules reach `.f1/`, and
 * `findMissingRuleInvariants` guards the load-bearing phrases that must never be
 * accidentally deleted.
 *
 * Pure data — no `vscode`, no `fs`.
 */

import { SMART_READY_MESSAGE } from './smart-paths';

/**
 * Phrases that carry the safety / readiness contract. Removing any of them
 * silently weakens the rules, so `SmartService.loadRules` warns and the
 * `smart-rules.test.ts` invariant check fails if one goes missing.
 */
export const RULE_INVARIANTS: readonly string[] = [
	SMART_READY_MESSAGE,
	'Do not create, modify, or delete files without explicit authorization',
	'Before you change anything',
	'run the closest available check or build',
	"never claim success you didn't verify"
];

/** Strip a leading YAML frontmatter block (`--- … ---`), returning the body. */
export const extractSkillBody = (markdown: string): string => {
	const frontmatter = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(markdown);
	const body = frontmatter ? markdown.slice(frontmatter[0].length) : markdown;
	return body.replace(/^\s+/, '');
};

/** Return the invariant phrases absent from `body` (empty when all present). */
export const findMissingRuleInvariants = (body: string): string[] => {
	return RULE_INVARIANTS.filter((phrase) => !body.includes(phrase));
};
