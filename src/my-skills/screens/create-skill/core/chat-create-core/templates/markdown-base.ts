export interface CreateChatSkillPayload {
	target: 'agents' | 'claude';
	name: string;
	query?: string;
	compatibilityTools?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalizes a raw name into a safe kebab-case slug. */
function buildSafeName(raw: string): string {
	return (
		raw
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\-_ ]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-+|-+$/g, '') // strip leading/trailing dashes
		|| 'my-skill'
	);
}

/**
 * Builds a clean, trigger-optimised description for the YAML front-matter.
 *
 * Rules:
 *  - No newlines (YAML scalar safety)
 *  - Max 200 chars
 *  - If query is too short (<80 chars) we append a usage nudge using the
 *    *original query text* — NOT safeName — so the hint reads naturally.
 *  - If no query supplied, return a TODO placeholder
 */
function buildDescription(query: string | undefined, safeName: string): string {
	if (!query) {
		return `[TODO: State what this skill does. Make it PUSHY so Claude actually uses it! e.g., "Use this skill whenever the user mentions X or Y, even if they do not explicitly ask for a skill."]`;
	}

	// Collapse all whitespace / newlines to a single space
	const cleaned = query.replace(/(\r\n|\n|\r)+/g, ' ').replace(/\s{2,}/g, ' ').trim();

	if (cleaned.length > 200) {
		return cleaned.substring(0, 197) + '...';
	}

	if (cleaned.length < 80) {
		// Use safeName only as a topic hint — keep prose readable
		const nudge = ` Use this skill whenever the user asks about ${safeName}, even if they don't explicitly request it.`;
		const combined = cleaned + nudge;
		// Nudge itself might push us past 200 chars
		return combined.length <= 200 ? combined : cleaned;
	}

	return cleaned;
}

/**
 * Escapes the description for YAML using JSON.stringify — covers quotes,
 * backslashes and any remaining control characters in one shot.
 */
function yamlEscape(value: string): string {
	return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Target-aware template fragments
// ---------------------------------------------------------------------------

function getInstructionsNote(isAgents: boolean): string {
	return isAgents
		? `<!-- TIP (Claude Code): You can instruct the model to execute local scripts, use CLI tools like \`claude -p\`, or spawn subagents for parallel tasks. -->`
		: `<!-- TIP (Claude.ai): You CANNOT run local scripts, use CLI tools, or spawn subagents. Keep instructions focused on text generation, analysis, and reading reference files only. -->`;
}

function getReferencesSection(isAgents: boolean): string {
	if (isAgents) {
		return `## References & Scripts
<!--
TIP: For large documentation (>300 lines), put it in \`references/\` and link it here.
If subagents end up writing the same helper code across test cases, extract it into \`scripts/\` —
this saves every future invocation from reinventing the wheel.
-->
[TODO: List external files your skill needs:]
- \`references/docs.md\`
- \`scripts/helper.js\``;
	}

	return `## Reference Files
<!--
TIP: Claude.ai can read reference files but cannot execute scripts.
For large documentation (>300 lines), put it in \`references/\` and link it here.
-->
[TODO: List any reference files your skill needs to read:]
- \`references/docs.md\``;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function createSkillMarkdown(payload: CreateChatSkillPayload): string {
	// Validate target — fail fast instead of silently defaulting
	if (payload.target !== 'agents' && payload.target !== 'claude') {
		throw new Error(`Invalid target "${payload.target}". Must be "agents" or "claude".`);
	}

	const { target, query } = payload;
	const safeName = buildSafeName(payload.name || '');
	const description = buildDescription(query, safeName);
	const yamlDescription = yamlEscape(description);
	const isAgents = target === 'agents';

	const instructionsNote = getInstructionsNote(isAgents);
	const referencesSection = getReferencesSection(isAgents);

	const compatibilityLine = payload.compatibilityTools && payload.compatibilityTools.length > 0
		? `compatibility: [${payload.compatibilityTools.map(t => `"${t}"`).join(', ')}] # [TODO - optional]: Add required tools here.`
		: 'compatibility: [] # [TODO - optional]: Add required tools e.g. ["python", "node"]';

	// NOTE: `compatibility: []` must sit on the same line — inline comment is valid YAML.
	return `---
name: ${safeName}
description: ${yamlDescription}
license: MIT
metadata:
  author: my skills (FAST)
  version: "1.0.0"
${compatibilityLine}
---

# ${safeName}

<!--
TIP: Keep this file under 500 lines. Use the imperative form in instructions.
Explain WHY things matter instead of relying on heavy-handed MUSTs —
today's LLMs respond better to reasoning than rigid rules.
-->

## Overview

[TODO: Replace with a 1-3 sentence summary of what this skill does and why it exists.]

## Instructions

${instructionsNote}

Follow these steps when executing this skill:

1. [TODO: Step 1 — describe the action and WHY it matters]
2. [TODO: Step 2...]
3. [TODO: Step 3...]

## Output Format

<!--
TIP: Provide exact templates or schemas when you want strict formatting.
The more concrete the example, the less Claude has to guess.
-->

[TODO: Specify the exact format, template, or schema for the output.]

\`\`\`markdown
# Target Output Structure
[TODO: replace with your actual structure]
...
\`\`\`

## Examples

<!--
TIP: Include realistic examples — the kind of thing a real user would actually send.
Add personal context, file names, column names, etc. to make them concrete.
-->

**Example 1:**
Input: [TODO: A realistic, specific user prompt — not abstract]
Output: [TODO: The exact output format you expect]

${referencesSection}
`;
}
