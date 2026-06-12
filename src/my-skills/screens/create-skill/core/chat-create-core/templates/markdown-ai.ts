import type { CreateChatSkillPayload } from './markdown-base';

export function createSkillMarkdownAI(payload: CreateChatSkillPayload): string {
	const compatibilityLine = payload.compatibilityTools && payload.compatibilityTools.length > 0
		? `compatibility: [${payload.compatibilityTools.map(t => `"${t}"`).join(', ')}] # [TODO - optional]: Add required tools here.`
		: 'compatibility: [] # [TODO - optional]: Add required tools e.g. ["python", "node"]';

	// TODO: La IA generará esto en el futuro.
	return `---
name: AI Template
${compatibilityLine}
---

# En construcción por la IA
`;
}
