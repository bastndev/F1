import * as vscode from 'vscode';
import { getProjectAnalysis } from '../shared/project-analyzer';
import { createSkillMarkdown, type CreateChatSkillPayload } from './templates/markdown-base';
import { createSkillMarkdownFast } from './templates/markdown-fast';
import { createSkillMarkdownAI } from './templates/markdown-ai';

export interface CreateChatSkillPayloadWithTemplate extends CreateChatSkillPayload {
	template: 'base' | 'fast' | 'ai';
}

export async function createSkillBoilerplate(
	workspaceUri: vscode.Uri,
	payload: CreateChatSkillPayloadWithTemplate
): Promise<void> {
	// 1. Determine folder path based on target
	const folderPrefix = payload.target === 'claude' ? '.claude/skills' : '.agents/skills';
	
	// Ensure the skill name is a safe folder name (though the UI validation already does this)
	const safeName = payload.name.trim();
	const skillFolderUri = vscode.Uri.joinPath(workspaceUri, folderPrefix, safeName);
	const fileUri = vscode.Uri.joinPath(skillFolderUri, 'SKILL.md');

	// 2. Fetch project analysis to populate compatibility tools
	const analysis = await getProjectAnalysis();
	payload.compatibilityTools = analysis.technologies.map(t => t.id).slice(0, 3);

	// 3. Generate the YAML + Markdown content
	let content: string;
	if (payload.template === 'fast') {
		content = createSkillMarkdownFast(payload);
	} else if (payload.template === 'ai') {
		content = createSkillMarkdownAI(payload);
	} else {
		content = createSkillMarkdown(payload);
	}

	// 4. Create the parent directory explicitly before writing the file.
	await vscode.workspace.fs.createDirectory(skillFolderUri);

	// 5. Write the file
	await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
}
