import type { CreateChatSkillPayload } from './markdown-base';
import { getFastContext } from '../fast-context-manager';
import { buildBetterDescription, buildFallbackInstructions } from './description-better';
import { getSkillFastTemplate, renderSkillFastTemplateBody } from './skill-fast';
import type { SkillFastReferenceSection } from './skill-fast';
import { normalizeSkillFastIntent } from './skill-fast/intent-signals';
import { buildSkillFastIntro } from './skill-fast/intro';
import { extractReferenceSkillSections } from './skill-fast/reference-sections';

function finalizeSkillMarkdown(markdown: string): string {
	return markdown
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/[ \t]+$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd() + '\n';
}

function renderFallbackBody(name: string, techs: string[], description: string, activationDescription: string): string {
	return `## Overview

${activationDescription}

## Instructions

Follow these steps when executing this skill:

${buildFallbackInstructions(name, techs, description)}

## Output Format

Return a concise, structured response tailored to the task. Include exact file paths or commands when relevant, and call out caveats that affect correctness.

## Example

Input: Improve or create ${name} for ${techs.length > 0 ? techs.join(', ') : 'the target workflow'} and keep the output aligned with the existing project conventions.
Output: A focused implementation or recommendation with concrete steps, paths, and brief reasoning.

## Reference Targets

Use relevant project files, tests, commands, and documentation discovered during the task.`;
}

export function createSkillMarkdownFast(payload: CreateChatSkillPayload): string {
	const context = getFastContext();
	const name = context.name || payload.name;
	const techs = context.technologies || [];
	const categoryId = techs[0];
	const variantId = techs[1];
	const translatedDesc = normalizeSkillFastIntent(context.description || payload.query || '');
	const localTemplate = getSkillFastTemplate(categoryId, variantId);

	const betterDescription = buildBetterDescription(translatedDesc, techs);

	let referenceSections: SkillFastReferenceSection[] = [];
	for (const markdown of context.downloadedSkillsText) {
		const sections = extractReferenceSkillSections(markdown, 2);
		if (sections.length > 0) {
			referenceSections = sections.map(section => ({
				title: section.title,
				body: section.body,
			}));
			break;
		}
	}

	const renderContext = {
		name,
		techs,
		userDescription: translatedDesc,
		activationDescription: betterDescription,
		referenceInstructions: '',
		referenceSections,
	};

	const body = localTemplate
		? [
			buildSkillFastIntro(localTemplate, renderContext),
			'',
			renderSkillFastTemplateBody(localTemplate, renderContext),
		].join('\n')
		: renderFallbackBody(name, techs, translatedDesc, betterDescription);

	const safeDescription = betterDescription 
		? betterDescription.replace(/(\r\n|\n|\r)+/g, ' - ').replace(/"/g, '\\"') 
		: 'Fast skill generated template';
	
	const compatibilityLine = payload.compatibilityTools && payload.compatibilityTools.length > 0
		? `compatibility: [${payload.compatibilityTools.map(t => `"${t}"`).join(', ')}]`
		: 'compatibility: []';
	
	return finalizeSkillMarkdown(`---
name: ${name}
description: "${safeDescription}"
license: MIT
metadata:
  author: my skills (FAST)
  version: "1.0.0"
${compatibilityLine}
---

# ${name}

${body}
`);
}
