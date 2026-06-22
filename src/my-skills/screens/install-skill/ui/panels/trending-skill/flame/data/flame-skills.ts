export interface FlameSkillSource {
	owner: string;
	repo: string;
	path: string;
	ref: string;
}

/** Flame skills are pulled live from this repository folder — add a skill folder there and it shows up here automatically. */
export const FLAME_SKILL_SOURCE: FlameSkillSource = {
	owner: 'bastndev',
	repo: 'skills',
	path: 'skills',
	ref: 'main',
};

/** Opened when a flame skill row (not its Install button) is clicked. */
export const FLAME_SKILL_REPO_URL = 'https://github.com/bastndev/skills';
