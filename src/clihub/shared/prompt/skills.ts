/**
 * Workspace skills support for the prompt chat. Selected skills are
 * represented by ONE compact aggregate token in the textarea — "[Skills #2]"
 * — whose count updates in place as chips toggle. The token is purely a
 * visual indicator: the ordered chip selection is authoritative, and on send
 * it expands into an explicit instruction with each SKILL.md route resolved
 * for the active CLI.
 *
 * A skill is a folder containing a SKILL.md under one of two roots:
 *   .claude/skills/  — Claude Code's native location
 *   .agents/skills/  — the cross-agent convention
 * The host surfaces the union deduplicated by name, remembering which
 * roots hold each skill so the send-time path can prefer the right copy
 * (.claude for Claude sessions, .agents for everything else).
 */

export type SkillRoot = 'agents' | 'claude';

export interface WorkspaceSkill {
	name: string;
	roots: SkillRoot[];
}

export const skillRootDirs: Record<SkillRoot, string> = {
	agents: '.agents/skills',
	claude: '.claude/skills',
};

// Matches standalone compact tokens (/skill, /skills #N) and legacy bracket
// shapes so old drafts still clean up correctly. The compact token must be at
// the start of text or after whitespace, and end before whitespace/end-of-text;
// quoted text like `"/skill"` must remain plain user text.
export const skillsTokenPattern = /(?<=^|\s)(?:\/skills #\d+|\/skill(?!s))(?=$|\s)|\[Skills? #[^\]]+\]/g;
export const skillsTokenPresencePattern = /(?<=^|\s)(?:\/skills #\d+|\/skill(?!s))(?=$|\s)|\[Skills? #[^\]]+\]/;
export const skillsTokenWithOptionalTrailingSpacePattern = /(?<=^|\s)(?:\/skills #\d+|\/skill(?!s)) ?|\[Skills? #[^\]]+\] ?/g;

export function buildSkillsToken(count: number): string {
	return count === 1 ? '/skill' : `/skills #${count}`;
}

/** Relative SKILL.md route, preferring the copy the active CLI reads natively. */
export function resolveSkillPath(skill: WorkspaceSkill, preferClaude: boolean): string {
	const preferred: SkillRoot = preferClaude ? 'claude' : 'agents';
	const root = skill.roots.includes(preferred) ? preferred : (skill.roots[0] ?? preferred);
	return `${skillRootDirs[root]}/${skill.name}/SKILL.md`;
}

/**
 * Strip the visual token(s) and prepend the real instruction, listing the
 * selected skills in selection order with their resolved SKILL.md routes.
 * Always called after translation — the generated English must never go
 * through the translator.
 */
export function expandSkillsToken(text: string, selected: WorkspaceSkill[], preferClaude: boolean): string {
	const cleaned = text.replace(skillsTokenWithOptionalTrailingSpacePattern, '').trimStart();

	if (!selected.length) {
		return cleaned;
	}

	const header = selected.length === 1
		? `Use the "${selected[0].name}" skill (read ${resolveSkillPath(selected[0], preferClaude)}).`
		: `Use these skills: ${selected
				.map((skill) => `"${skill.name}" (read ${resolveSkillPath(skill, preferClaude)})`)
				.join(', ')}.`;

	return cleaned ? `${header}\n\n${cleaned}` : header;
}
