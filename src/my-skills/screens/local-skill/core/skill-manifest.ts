import * as vscode from 'vscode';

export interface SkillManifestMetadata {
	name?: string;
	description?: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const CSI_PATTERN = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;
const OSC_PATTERN = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
const SIMPLE_ESCAPE_PATTERN = /\x1b[\x20-\x7e]/g;
const CONTROL_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

export async function readSkillManifestMetadata(folderUri: vscode.Uri): Promise<SkillManifestMetadata> {
	try {
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folderUri, 'SKILL.md'));
		return parseSkillManifestMetadata(new TextDecoder().decode(bytes));
	} catch {
		return {};
	}
}

export function parseSkillManifestMetadata(raw: string): SkillManifestMetadata {
	const match = raw.match(FRONTMATTER_PATTERN);
	if (!match) {
		return {};
	}

	const yaml = match[1] ?? '';
	return {
		name: readYamlString(yaml, 'name'),
		description: readYamlString(yaml, 'description'),
	};
}

function readYamlString(yaml: string, key: 'name' | 'description'): string | undefined {
	const pattern = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`, 'm');
	const match = yaml.match(pattern);
	const rawValue = match?.[1]?.trim();
	if (!rawValue || rawValue.startsWith('[') || rawValue.startsWith('{')) {
		return undefined;
	}

	const unquoted = stripYamlQuotes(rawValue);
	const sanitized = sanitizeMetadata(unquoted);
	return sanitized.length > 0 ? sanitized : undefined;
}

function stripYamlQuotes(value: string): string {
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}

	return value;
}

function sanitizeMetadata(value: string): string {
	return value
		.replace(OSC_PATTERN, '')
		.replace(CSI_PATTERN, '')
		.replace(SIMPLE_ESCAPE_PATTERN, '')
		.replace(CONTROL_PATTERN, '')
		.replace(/[\r\n]+/g, ' ')
		.trim();
}
