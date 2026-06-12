import * as vscode from 'vscode';
import { createAgentsClaudeMarkdown } from './markdown';
import { inspectAgentsClaudeWorkspace } from './workspace-inspector';
import type { AgentsClaudeInstructionFileName } from './types';

export type { AgentsClaudeInstructionFileName } from './types';

export async function createAgentsClaudeInstructionMarkdown(options: {
	fileName: AgentsClaudeInstructionFileName;
	workspaceUri: vscode.Uri;
	workspaceName: string;
}): Promise<string> {
	const context = await inspectAgentsClaudeWorkspace(options.workspaceUri, options.workspaceName);
	return createAgentsClaudeMarkdown(options.fileName, context);
}

export function isAgentsClaudeInstructionFileName(value: unknown): value is AgentsClaudeInstructionFileName {
	return value === 'AGENTS.md' || value === 'CLAUDE.md';
}
