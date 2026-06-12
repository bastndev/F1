export const ROOT_SKILL_FOLDERS = [
	'.agents/skills',
	'.claude/skills',
] as const;

export const ROOT_SKILL_FOLDER_WATCH_PATTERNS: readonly string[] = ROOT_SKILL_FOLDERS.flatMap(folder => [
	folder.split('/')[0], // Watch base folder for manual deletions (e.g., '.agents')
	folder,
	`${folder}/*`,
	`${folder}/*/SKILL.md`,
]);
