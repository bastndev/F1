/**
 * Pre-translation sanitizer for terminal selections.
 *
 * CLI output mixes prose with TUI "frames": box-drawing tables, tree
 * diagrams, horizontal rules, spinner leftovers. Sent raw to a translation
 * provider those frames get shredded into word soup. This module splits a
 * selection into segments:
 *
 *   - prose    → translatable text. Box tables are converted to markdown
 *                pipe tables (cells survive translation and render as real
 *                tables). Rule lines become `---`, noise is dropped.
 *   - diagram  → tree diagrams kept verbatim (paths must not be translated);
 *                the modal renders them as a monospace block.
 */

export type TerminalSegment = {
	kind: 'prose' | 'diagram';
	content: string;
};

type LineKind =
	| 'blank'
	| 'noise'
	| 'separator'
	| 'table-border'
	| 'table-content'
	| 'tree'
	| 'pipes'
	| 'prose';

// Lines made purely of frame characters and whitespace.
const structuralOnly = /^[\s─━═┄┈│┃┌┬┐├┼┤└┴┘╭╮╰╯╔╦╗╠╬╣╚╩╝║]+$/;
// Corner/junction characters only appear in table frames, never in rules.
const junctionChars = /[┌┬┐┼├┤└┴┘╭╮╰╯╔╦╗╠╬╣╚╩╝]/;

function classifyLine(trimmed: string): LineKind {
	if (!trimmed) {
		return 'blank';
	}

	// Braille spinner leftovers (⠋⠙⠹…)
	if (/^[\s⠀-⣿]+$/.test(trimmed)) {
		return 'noise';
	}

	if (structuralOnly.test(trimmed)) {
		if (junctionChars.test(trimmed)) {
			return 'table-border';
		}
		if (/[│┃]/.test(trimmed)) {
			return 'pipes';
		}
		return 'separator';
	}

	// Tree branch: optional │ guides, then ├── / └── plus a label.
	if (/^[│┃\s]*[├└][─━]+(?:\s|$)/.test(trimmed)) {
		return 'tree';
	}

	// Starts with a frame pipe: table row when it has several cells,
	// otherwise a tree/diagram continuation line.
	if (/^[│┃]/.test(trimmed)) {
		return (trimmed.match(/[│┃]/g) || []).length >= 2 ? 'table-content' : 'tree';
	}

	return 'prose';
}

export function segmentTerminalSelection(raw: string): TerminalSegment[] {
	const lines = raw
		.replace(/\u00a0/g, ' ')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/\s+$/, ''));

	const kinds = lines.map((line) => classifyLine(line.trim()));

	const segments: TerminalSegment[] = [];
	let prose: string[] = [];
	let block: string[] = [];
	let blockKind: 'tree' | 'table' | null = null;

	const flushProse = () => {
		const cleaned = cleanProse(prose);
		prose = [];
		if (cleaned) {
			segments.push({ kind: 'prose', content: cleaned });
		}
	};

	const flushBlock = () => {
		if (!blockKind) {
			return;
		}
		if (blockKind === 'tree') {
			flushProse();
			segments.push({ kind: 'diagram', content: block.join('\n') });
		} else {
			// Tables stay in the prose stream as pipe markdown — their cell
			// text is regular language that should be translated.
			const table = convertBoxTable(block);
			if (table) {
				prose.push('', table, '');
			}
		}
		block = [];
		blockKind = null;
	};

	const nextRelevant = (index: number): LineKind | undefined => {
		for (let i = index + 1; i < kinds.length; i += 1) {
			if (kinds[i] !== 'blank' && kinds[i] !== 'noise') {
				return kinds[i];
			}
		}
		return undefined;
	};

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];

		switch (kinds[i]) {
			case 'noise':
				break;

			case 'blank': {
				if (blockKind) {
					// Keep a frame open across a gap only if it clearly continues.
					const upcoming = nextRelevant(i);
					const continues = blockKind === 'table'
						? upcoming === 'table-border' || upcoming === 'table-content'
						: upcoming === 'tree' || upcoming === 'pipes';
					if (!continues) {
						flushBlock();
					}
				} else {
					prose.push('');
				}
				break;
			}

			case 'separator': {
				if (blockKind === 'table') {
					block.push(line);
					break;
				}
				if (blockKind === 'tree') {
					flushBlock();
				}
				prose.push('---');
				break;
			}

			case 'pipes': {
				// Vertical guides inside an open frame; stray pipes are noise.
				if (blockKind) {
					block.push(line);
				}
				break;
			}

			case 'tree': {
				if (blockKind === 'table') {
					flushBlock();
				}
				blockKind = 'tree';
				block.push(line);
				break;
			}

			case 'table-border':
			case 'table-content': {
				if (blockKind === 'tree') {
					flushBlock();
				}
				blockKind = 'table';
				block.push(line);
				break;
			}

			default: {
				if (blockKind) {
					flushBlock();
				}
				prose.push(line);
			}
		}
	}

	flushBlock();
	flushProse();
	return segments;
}

function cleanProse(lines: string[]): string {
	const out: string[] = [];

	for (const line of lines) {
		const isBlank = !line.trim();
		if (isBlank) {
			if (!out.length || out[out.length - 1] === '') {
				continue;
			}
			out.push('');
			continue;
		}

		if (line === '---') {
			// Drop leading rules and collapse runs of rules into one.
			const lastContent = [...out].reverse().find((entry) => entry.trim());
			if (!lastContent || lastContent === '---') {
				continue;
			}
		}

		out.push(line);
	}

	// Drop trailing blanks and rules.
	while (out.length && (out[out.length - 1] === '' || out[out.length - 1] === '---')) {
		out.pop();
	}

	return out.join('\n').trim();
}

function convertBoxTable(lines: string[]): string {
	const rows: string[][] = [];
	let current: string[] | null = null;

	const commit = () => {
		if (current && current.some((cell) => cell)) {
			rows.push(current);
		}
		current = null;
	};

	for (const raw of lines) {
		const trimmed = raw.trim();
		if (classifyLine(trimmed) !== 'table-content') {
			commit();
			continue;
		}

		const cells = trimmed
			.replace(/^[│┃]\s*/, '')
			.replace(/\s*[│┃]\s*$/, '')
			.split(/[│┃]/)
			.map((cell) => cell.trim().replace(/\|/g, '/'));

		if (!current) {
			current = cells;
			continue;
		}

		if (cells[0]) {
			// First column has text again → a new logical row.
			commit();
			current = cells;
			continue;
		}

		// Wrapped continuation of the previous row — merge cell-wise.
		cells.forEach((cellText, index) => {
			if (!cellText) {
				return;
			}
			current![index] = current![index] ? `${current![index]} ${cellText}` : cellText;
		});
	}

	commit();
	if (!rows.length) {
		return '';
	}

	const width = Math.max(...rows.map((row) => row.length));
	const pad = (row: string[]) => {
		const cells = [...row];
		while (cells.length < width) {
			cells.push('');
		}
		return cells;
	};

	const [head, ...body] = rows.map(pad);
	const format = (row: string[]) => `| ${row.join(' | ')} |`;
	const out = [format(head), `| ${head.map(() => '---').join(' | ')} |`];
	for (const row of body) {
		out.push(format(row));
	}

	return out.join('\n');
}
