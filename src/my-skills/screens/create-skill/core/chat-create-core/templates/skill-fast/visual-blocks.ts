export type SkillFastVisualBlockKind = 'table' | 'matrix' | 'checklist' | 'codeFence' | 'fileTree';

interface SkillFastVisualBlockBase {
	kind: SkillFastVisualBlockKind;
	title: string;
	intro?: string;
}

export interface SkillFastTableBlock extends SkillFastVisualBlockBase {
	kind: 'table' | 'matrix';
	headers: string[];
	rows: string[][];
}

export interface SkillFastChecklistBlock extends SkillFastVisualBlockBase {
	kind: 'checklist';
	items: string[];
}

export interface SkillFastCodeFenceBlock extends SkillFastVisualBlockBase {
	kind: 'codeFence' | 'fileTree';
	language: string;
	lines: string[];
}

export type SkillFastVisualBlock =
	| SkillFastTableBlock
	| SkillFastChecklistBlock
	| SkillFastCodeFenceBlock;

function cleanInline(value: string): string {
	return value
		.replace(/\r\n?/g, '\n')
		.replace(/\n+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function cleanBlockLine(value: string): string {
	return value
		.replace(/\r\n?/g, '\n')
		.replace(/```/g, "'''")
		.replace(/\t/g, '  ')
		.trimEnd();
}

function escapeTableCell(value: string): string {
	return cleanInline(value).replace(/\|/g, '\\|');
}

function renderTable(headers: string[], rows: string[][]): string {
	if (headers.length === 0 || rows.length === 0) {
		return '';
	}

	const safeHeaders = headers.map(escapeTableCell);
	const separator = safeHeaders.map(() => '---');
	const safeRows = rows.map(row => safeHeaders.map((_, index) => escapeTableCell(row[index] ?? '')));

	return [
		`| ${safeHeaders.join(' | ')} |`,
		`| ${separator.join(' | ')} |`,
		...safeRows.map(row => `| ${row.join(' | ')} |`),
	].join('\n');
}

function renderChecklist(items: string[]): string {
	return items
		.map(cleanInline)
		.filter(Boolean)
		.map(item => `- [ ] ${item}`)
		.join('\n');
}

function renderCodeFence(language: string, lines: string[]): string {
	const safeLanguage = cleanInline(language).replace(/[^a-zA-Z0-9_-]/g, '') || 'text';
	const safeLines = lines.map(cleanBlockLine);

	return [
		'```' + safeLanguage,
		...safeLines,
		'```',
	].join('\n');
}

function renderBlockBody(block: SkillFastVisualBlock): string {
	switch (block.kind) {
		case 'table':
		case 'matrix':
			return renderTable(block.headers, block.rows);
		case 'checklist':
			return renderChecklist(block.items);
		case 'codeFence':
		case 'fileTree':
			return renderCodeFence(block.language, block.lines);
		default:
			return '';
	}
}

export function renderSkillFastVisualBlock(block: SkillFastVisualBlock): string {
	const body = renderBlockBody(block);
	if (!body) {
		return '';
	}

	return [
		`## ${cleanInline(block.title)}`,
		...(block.intro ? ['', cleanInline(block.intro)] : []),
		'',
		body,
	].join('\n');
}

export function renderSkillFastVisualBlocks(blocks: SkillFastVisualBlock[], maxBlocks = 2): string {
	return blocks
		.slice(0, Math.max(0, maxBlocks))
		.map(renderSkillFastVisualBlock)
		.filter(Boolean)
		.join('\n\n');
}
