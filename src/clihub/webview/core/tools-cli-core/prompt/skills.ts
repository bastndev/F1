/**
 * Workspace skills support for the prompt chat, mirroring the [Image #N]
 * token system: clicking a skill chip inserts an atomic "[Skill #name]"
 * token in the textarea, and on send each token expands into an explicit
 * instruction with the SKILL.md route resolved for the active CLI.
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

export const skillTokenPattern = /\[Skill #([^\]]+)\]/g;

export function buildSkillToken(name: string): string {
	return `[Skill #${name}]`;
}

/** Relative SKILL.md route, preferring the copy the active CLI reads natively. */
export function resolveSkillPath(skill: WorkspaceSkill, preferClaude: boolean): string {
	const preferred: SkillRoot = preferClaude ? 'claude' : 'agents';
	const root = skill.roots.includes(preferred) ? preferred : (skill.roots[0] ?? preferred);
	return `${skillRootDirs[root]}/${skill.name}/SKILL.md`;
}

/**
 * Expand [Skill #name] tokens into CLI-readable instructions.
 *
 * Tokens leading the prompt (the chip-click default) collapse into one
 * explicit header sentence; tokens used mid-sentence become an inline
 * reference at their position. Unknown names are left untouched so a stale
 * draft never corrupts the prompt. Always called after translation — the
 * generated English must never go through the translator.
 */
export function expandSkillTokens(text: string, skills: WorkspaceSkill[], preferClaude: boolean): string {
	if (!skills.length) {
		return text;
	}

	const byName = new Map(skills.map((skill) => [skill.name, skill]));

	// Peel known tokens off the start of the prompt.
	const leading: WorkspaceSkill[] = [];
	let rest = text;
	for (;;) {
		const match = /^\s*\[Skill #([^\]]+)\]/.exec(rest);
		const skill = match ? byName.get(match[1]) : undefined;
		if (!match || !skill) {
			break;
		}
		leading.push(skill);
		rest = rest.slice(match[0].length);
	}
	rest = rest.trimStart();

	// Remaining tokens read naturally in place: «use [Skill #x] for…» becomes
	// «use "x" (.agents/skills/x/SKILL.md) for…».
	rest = rest.replace(skillTokenPattern, (token, name: string) => {
		const skill = byName.get(name);
		return skill ? `"${skill.name}" (${resolveSkillPath(skill, preferClaude)})` : token;
	});

	if (!leading.length) {
		return rest;
	}

	const references = leading.map(
		(skill) => `"${skill.name}" (read ${resolveSkillPath(skill, preferClaude)})`
	);
	const header = leading.length === 1
		? `Use the "${leading[0].name}" skill (read ${resolveSkillPath(leading[0], preferClaude)}).`
		: `Use these skills: ${references.join(', ')}.`;

	return rest ? `${header}\n\n${rest}` : header;
}
