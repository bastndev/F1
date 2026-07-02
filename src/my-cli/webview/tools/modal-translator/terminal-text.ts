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
 *   - code     → fenced or detected source code. Never translated; the modal
 *                shows a numbered "code here" placeholder instead.
 *   - markdown → lines with structural markers (headings, emoji items, score
 *                tables) that are sent to translation with their markers
 *                protected so the renderer can rebuild the structure.
 */

export type TerminalSegment = {
	kind: 'prose' | 'diagram' | 'code' | 'markdown';
	content: string;
};

/**
 * One rendered emoji run, as a regex source (shared with translator.ts and
 * markdown-lite.ts so all three agree on what counts as an emoji prefix).
 * `\p{Emoji_Presentation}` alone misses the pictographs that render as emoji
 * only through a VS16 (⚠️ ❤️ 🏗️ — base char has Emoji_Presentation=No), so a
 * unit is: a default-emoji char (with optional redundant VS16), or a
 * pictograph + required VS16, or a skin-tone modifier, or the ZWJ gluing
 * sequences like 👨‍💻. The VS16 stays REQUIRED on the pictograph alternative:
 * bare \p{Extended_Pictographic} would also match © ® ™ in plain prose.
 */
export const emojiRunSource =
	'(?:\\p{Emoji_Presentation}\\uFE0F?|\\p{Extended_Pictographic}\\uFE0F|\\p{Emoji_Modifier}|\\u200D)+';

/**
 * Lines that carry visual structure the translator must preserve. Each entry
 * is a regex that matches a line whose *leading markers* (emoji, `##`, `>`,
 * etc.) must survive translation so the renderer can rebuild the structure.
 */
const markdownLinePatterns: RegExp[] = [
	// Heading: ## Title / ### Subtitle
	/^#{1,6}\s+/,
	// Emoji-prefixed label: 🔍 Project Understanding, ⚠️ Findings
	new RegExp(`^${emojiRunSource}\\s*`, 'u'),
	/^\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?\s*/u,
	// Bracket label: [end] / [fin] / [start]
	/^\[[\w\s]+\]\s+/,
	// Blockquote: > text
	/^>\s+/,
	// Score table line: emoji + label + score pattern (e.g. 🏗️ Architecture 8/10)
	new RegExp(`${emojiRunSource}.*\\b\\d{1,2}\\/10\\b`, 'u'),
];

/**
 * Detect whether a line carries structural markdown markers that should be
 * protected through translation.
 */
export function isMarkdownStructuredLine(trimmed: string): boolean {
	if (!trimmed) {
		return false;
	}
	return markdownLinePatterns.some((pattern) => pattern.test(trimmed));
}

type LineKind =
	| 'blank'
	| 'noise'
	| 'separator'
	| 'table-border'
	| 'table-content'
	| 'tree'
	| 'pipes'
	| 'code'
	| 'markdown'
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

	// Structured markdown: headings, emoji-prefixed labels, bracket labels.
	// These carry formatting markers that must survive translation.
	if (isMarkdownStructuredLine(trimmed)) {
		return 'markdown';
	}

	return 'prose';
}

/**
 * Heuristic: does this line read like source code rather than prose?
 * Conservative on purpose \u2014 a paragraph of English must never match.
 */
function looksLikeCode(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed) {
		return false;
	}

	let score = 0;
	// Strong signals
	if (/^\s*[}\])];?,?$/.test(trimmed)) {
		score += 3;
	}
	if (/[;{]\s*$/.test(trimmed)) {
		score += 2;
	}
	// Braces — object/array literals and blocks. Effectively absent from English
	// prose, so a safe strong signal; the >=2-consecutive-lines rule below still
	// stops a lone braced sentence from ever becoming a code block on its own.
	if (/[{}]/.test(trimmed)) {
		score += 2;
	}
	if (/^(?:import|export|from|const|let|var|function|async|await|class|interface|enum|type|def|fn|pub|impl|struct|public|private|protected|static|void|elif|namespace|using|package|require)\b/.test(trimmed)) {
		score += 2;
	}
	if (/=>|::|===|!==|&&|\|\||\+=|-=|\*=|<\/|\/>/.test(trimmed)) {
		score += 2;
	}
	if (/^\s*(?:\/\/|\/\*|\*\/|\*\s|<!--)/.test(trimmed)) {
		score += 2;
	}
	// Weak signals
	if (/^[\w$.]+\s*\([^)]*\)[;,]?$/.test(trimmed)) {
		score += 1;
	}
	if (/^[\w$.[\]'"]+\s*[:=]\s*\S/.test(trimmed) && !/\s(?:is|are|was|the|a|an)\s/i.test(trimmed)) {
		score += 1;
	}
	if (/^\s{2,}|\t/.test(line)) {
		score += 1;
	}
	// Trailing line comment after code ("x // note"); the surrounding spaces keep
	// it from matching the "://" in a URL.
	if (/\s\/\/\s/.test(trimmed)) {
		score += 1;
	}
	// Quoted value after a key ("href: '/'", "label: 'home'").
	if (/[\w$]+\s*:\s*['"]/.test(trimmed)) {
		score += 1;
	}

	return score >= 2;
}

/**
 * Overrides line kinds with 'code' for fenced blocks and for contiguous
 * runs of code-looking lines (at least two, blanks allowed inside).
 */
function markCodeLines(lines: string[], kinds: LineKind[]): void {
	// Pass 1: ``` fences \u2014 everything between (and including) is code.
	let inFence = false;
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i].trim().startsWith('```')) {
			kinds[i] = 'code';
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			kinds[i] = 'code';
		}
	}

	// Pass 2: bare code runs inside prose regions.
	let runStart = -1;
	let codeLineCount = 0;

	const closeRun = (end: number) => {
		if (runStart >= 0 && codeLineCount >= 2) {
			for (let i = runStart; i < end; i += 1) {
				if (kinds[i] === 'prose' || (kinds[i] === 'blank' && i > runStart)) {
					kinds[i] = 'code';
				}
			}
		}
		runStart = -1;
		codeLineCount = 0;
	};

	for (let i = 0; i < lines.length; i += 1) {
		if (kinds[i] === 'prose' && looksLikeCode(lines[i])) {
			if (runStart < 0) {
				runStart = i;
			}
			codeLineCount += 1;
			continue;
		}
		// Blanks inside a run stay pending; anything else ends it.
		if (kinds[i] === 'blank' && runStart >= 0) {
			continue;
		}
		closeRun(i);
	}
	closeRun(lines.length);

	// Trailing blanks that were absorbed into a run revert to blanks.
	for (let i = lines.length - 1; i >= 0 && kinds[i] === 'code' && !lines[i].trim(); i -= 1) {
		kinds[i] = 'blank';
	}
}

export function segmentTerminalSelection(raw: string): TerminalSegment[] {
	const lines = raw
		.replace(/\u00a0/g, ' ')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/\s+$/, ''));

	const kinds = lines.map((line) => classifyLine(line.trim()));
	markCodeLines(lines, kinds);

	const segments: TerminalSegment[] = [];
	let prose: string[] = [];
	let block: string[] = [];
	let blockKind: 'tree' | 'table' | 'code' | null = null;

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
		if (blockKind === 'tree' || blockKind === 'code') {
			flushProse();
			segments.push({
				kind: blockKind === 'tree' ? 'diagram' : 'code',
				content: block.join('\n'),
			});
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
						: blockKind === 'code'
							? upcoming === 'code'
							: upcoming === 'tree' || upcoming === 'pipes';
					if (continues && blockKind === 'code') {
						block.push(line);
					}
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
				if (blockKind) {
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
				if (blockKind && blockKind !== 'tree') {
					flushBlock();
				}
				blockKind = 'tree';
				block.push(line);
				break;
			}

			case 'code': {
				if (blockKind && blockKind !== 'code') {
					flushBlock();
				}
				blockKind = 'code';
				block.push(line);
				break;
			}

			case 'markdown': {
				// Structured lines (headings, emoji items, scores) flow into
				// the prose stream but flush any open block first. The
				// translator protects their markers before the API call.
				if (blockKind) {
					flushBlock();
				}
				prose.push(line);
				break;
			}

			case 'table-border':
			case 'table-content': {
				if (blockKind && blockKind !== 'table') {
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
