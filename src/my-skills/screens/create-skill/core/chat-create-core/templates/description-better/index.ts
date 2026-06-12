export function buildBetterDescription(translatedDescription: string, categories: string[]): string {
	const techs = categories.filter(Boolean);
	const techLabel = techs.length > 0 ? techs.join(', ') : 'the relevant technologies in this workspace';
	const cleanDesc = translatedDescription.trim().replace(/\s+/g, ' ');

	if (cleanDesc) {
		return `Use this skill whenever the user needs help with ${techLabel}. Focus especially on requests related to: ${cleanDesc} Even when the user does not explicitly ask for a skill, activate it if the task clearly matches this scope.`;
	}

	return `Use this skill whenever the user needs help with ${techLabel}. Activate it proactively when the request clearly falls into this domain, even if the user does not explicitly mention a skill.`;
}

export function buildFallbackInstructions(name: string, categories: string[], description: string): string {
	const techLabel = categories.filter(Boolean).join(', ');
	const scopeLine = description.trim()
		? `Start by aligning the task with this skill's scope: ${description.trim().replace(/\s+/g, ' ')}`
		: `Start by identifying whether the request truly matches the ${name} workflow before proceeding.`;

	const contextLine = techLabel
		? `Inspect the relevant files, commands, and constraints around ${techLabel} before making changes so the output matches the real project context.`
		: 'Inspect the relevant files, commands, and constraints before making changes so the output matches the real project context.';

	return [
		`1. ${scopeLine}`,
		`2. ${contextLine}`,
		'3. Produce a concrete result, explain key decisions briefly, and avoid generic filler or placeholder guidance.',
	].join('\n');
}
