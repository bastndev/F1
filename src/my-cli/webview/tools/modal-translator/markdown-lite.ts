/**
 * Minimal, dependency-free markdown renderer for the Translator modal.
 *
 * Terminal selections of CLI answers are usually markdown-ish (headings,
 * lists, inline code) hard-wrapped at the terminal width. This renderer:
 *   - escapes everything first (selection text is untrusted for innerHTML),
 *   - joins consecutive plain lines into one paragraph (undoes hard wraps),
 *   - supports: # headings, dash/star/bullet and 1. lists (with lazy
 *     continuation), ``` fences, > quotes, ---, `code`, bold, italic, links.
 */

import { emojiRunSource } from './terminal-text';

// Score line: emoji + label + N/10 (e.g. "🏗️ Architecture 8/10"). The label
// may be several words ("🧹 Code Quality 8/10") — lazy up to the anchored score.
const scoreLinePattern = new RegExp(`^(${emojiRunSource}\\s*)(\\S.*?)\\s+(\\d{1,2}\\/10)\\s*$`, 'u');

// Emoji-prefixed item: "🔍 Project Understanding" / "📊 [end] Health Overview"
const emojiItemPattern = new RegExp(`^(${emojiRunSource}\\s*)(.*)`, 'u');

const escapeHtml = (text: string): string =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

// A run that looks like a filesystem path: optional ~ / . / .. root, then one or
// more "segment/" and a final segment. The lookbehind stops it starting mid-token
// or after ':' or '/', so it never bites into an http(s):// URL (those become
// links) or an email. Candidates are still validated by isStylablePath.
const pathCandidatePattern = /(?<![\w@:/~.+-])((?:~|\.\.?)?\/?(?:[\w.@+-]+\/)+[\w.@+-]+)/g;

// Only paint a candidate that is confidently a path — a real file extension, a
// leading root (~/, ./, ../, /), or 2+ segments carrying a path-ish char (., -,
// _). This rejects prose slashes like "and/or", "he/she/they", "12/10".
function isStylablePath(raw: string): boolean {
	const slashes = (raw.match(/\//g) || []).length;
	if (slashes < 1) {
		return false;
	}
	const hasExtension = /\.[A-Za-z][\w]{0,7}$/.test(raw);
	const isRooted = /^(?:~\/|\.\.?\/|\/)/.test(raw);
	const isDeepAndRich = slashes >= 2 && /[._-]/.test(raw);
	return hasExtension || isRooted || isDeepAndRich;
}

function renderInline(text: string): string {
	let out = escapeHtml(text);

	// Pull inline code out first so bold/italic markers inside it stay literal.
	const codeSpans: string[] = [];
	out = out.replace(/`([^`]+)`/g, (_match, code: string) => {
		codeSpans.push(code);
		return `\u0000${codeSpans.length - 1}\u0000`;
	});

	// Bare filesystem paths (src/a/b.ts, ~/x) arrive unstyled — paint the confident
	// ones green so they stand out from prose. Runs before bold/italic/link on
	// escaped text; the emitted span carries no markdown/HTML metachars, so later
	// passes leave it intact. Paths inside `code` are already extracted above, so
	// they stay code and are not double-styled.
	out = out.replace(pathCandidatePattern, (match, raw: string) =>
		isStylablePath(raw) ? `<span class="md-path">${raw}</span>` : match);

	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
	out = out.replace(
		/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
		'<a class="md-link" href="$2" rel="noopener noreferrer">$1</a>',
	);

	out = out.replace(/\u0000(\d+)\u0000/g, (_match, index: string) =>
		`<code class="md-code">${codeSpans[Number(index)]}</code>`);

	return out;
}

export function renderMarkdownLite(markdown: string): string {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
	const html: string[] = [];

	let paragraph: string[] = [];
	let listType: 'ul' | 'ol' | null = null;
	let listStart = 1;
	let listItems: string[] = [];
	let inCode = false;
	let codeLang = '';
	let codeLines: string[] = [];
	let tableRows: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length) {
			html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
			paragraph = [];
		}
	};

	const flushList = () => {
		if (listType) {
			const startAttr = listType === 'ol' && listStart !== 1 ? ` start="${listStart}"` : '';
			html.push(`<${listType}${startAttr}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`);
			listType = null;
			listItems = [];
		}
	};

	const flushCode = () => {
		const treeClass = codeLang === 'tree' ? ' md-tree' : '';
		html.push(`<pre class="md-pre${treeClass}"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
		inCode = false;
		codeLang = '';
		codeLines = [];
	};

	const flushTable = () => {
		if (!tableRows.length) {
			return;
		}

		const parseRow = (row: string) =>
			row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
		const rows = tableRows.map(parseRow);
		tableRows = [];

		let header: string[] | null = null;
		let data = rows;
		if (rows.length >= 2 && rows[1].every((cell) => !cell || /^:?-{2,}:?$/.test(cell))) {
			header = rows[0];
			data = rows.slice(2);
		}

		const cells = (tag: 'th' | 'td', row: string[]) =>
			row.map((cell) => `<${tag}>${renderInline(cell)}</${tag}>`).join('');
		const head = header ? `<thead><tr>${cells('th', header)}</tr></thead>` : '';
		const body = data.map((row) => `<tr>${cells('td', row)}</tr>`).join('');
		html.push(`<table class="md-table">${head}<tbody>${body}</tbody></table>`);
	};

	const flushAll = () => {
		flushParagraph();
		flushList();
		flushTable();
	};

	for (const raw of lines) {
		if (inCode) {
			if (/^\s*```/.test(raw)) {
				flushCode();
			} else {
				codeLines.push(raw);
			}
			continue;
		}

		const trimmed = raw.trim();

		if (trimmed.startsWith('```')) {
			flushAll();
			inCode = true;
			codeLang = (trimmed.match(/^```(\w+)/)?.[1] || '').toLowerCase();
			continue;
		}

		if (trimmed.startsWith('|') && (trimmed.match(/\|/g) || []).length >= 2) {
			flushParagraph();
			flushList();
			tableRows.push(trimmed);
			continue;
		}
		flushTable();

		// Placeholder where untranslated source code was removed.
		const codeHere = trimmed.match(/^\[\[code-here:(\d+)\]\]$/);
		if (codeHere) {
			flushAll();
			html.push(
				`<div class="md-code-here" role="note">` +
				`<i class="ti ti-code" aria-hidden="true"></i>` +
				`<span class="md-code-here-label">code here</span>` +
				`<span class="md-code-here-num">#${codeHere[1]}</span>` +
				`</div>`
			);
			continue;
		}

		if (!trimmed) {
			flushAll();
			continue;
		}

		const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
		if (heading) {
			flushAll();
			const level = heading[1].length;
			html.push(`<h${level} class="md-h md-h${level}">${renderInline(heading[2])}</h${level}>`);
			continue;
		}

		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
			flushAll();
			html.push('<hr class="md-hr">');
			continue;
		}

		const quote = trimmed.match(/^>\s?(.*)$/);
		if (quote) {
			flushAll();
			html.push(`<blockquote class="md-quote">${renderInline(quote[1])}</blockquote>`);
			continue;
		}

		const scoreLine = trimmed.match(scoreLinePattern);
		if (scoreLine) {
			flushAll();
			html.push(
				`<div class="md-score-item">` +
				`<span class="md-score-emoji">${scoreLine[1]}</span>` +
				`<span class="md-score-label">${renderInline(scoreLine[2])}</span>` +
				`<span class="md-score-value">${scoreLine[3]}</span>` +
				`</div>`
			);
			continue;
		}

		const emojiItem = trimmed.match(emojiItemPattern);
		if (emojiItem) {
			flushAll();
			// Check if the content has a bracket label inside
			const innerContent = emojiItem[2];
			const bracketInner = innerContent.match(/^\[([^\]]+)\]\s*(.*)$/);
			if (bracketInner) {
				html.push(
					`<div class="md-emoji-item">` +
					`<span class="md-emoji">${emojiItem[1]}</span>` +
					`<span class="md-bracket">[${bracketInner[1]}]</span> ` +
					`${renderInline(bracketInner[2])}` +
					`</div>`
				);
			} else {
				html.push(
					`<div class="md-emoji-item">` +
					`<span class="md-emoji">${emojiItem[1]}</span> ` +
					`${renderInline(innerContent)}` +
					`</div>`
				);
			}
			continue;
		}

		// Bracket label standalone: "[end] Health Overview"
		const bracketLabel = trimmed.match(/^\[([^\]]+)\]\s+(.*)$/);
		if (bracketLabel) {
			flushAll();
			html.push(
				`<div class="md-emoji-item">` +
				`<span class="md-bracket">[${bracketLabel[1]}]</span> ` +
				`${renderInline(bracketLabel[2])}` +
				`</div>`
			);
			continue;
		}

		const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
		if (bullet) {
			flushParagraph();
			if (listType !== 'ul') {
				flushList();
				listType = 'ul';
			}
			listItems.push(bullet[1]);
			continue;
		}

		const ordered = trimmed.match(/^(\d{1,3})[.)]\s+(.*)$/);
		if (ordered) {
			flushParagraph();
			if (listType !== 'ol') {
				flushList();
				listType = 'ol';
				listStart = Number(ordered[1]);
			}
			listItems.push(ordered[2]);
			continue;
		}

		// Lazy continuation: a wrapped list item carries on without a marker.
		if (listType && listItems.length) {
			listItems[listItems.length - 1] += ` ${trimmed}`;
			continue;
		}

		// Plain line: soft-wrap into the open paragraph (undoes terminal wraps).
		paragraph.push(trimmed);
	}

	if (inCode && codeLines.length) {
		flushCode();
	}
	flushAll();

	return html.join('');
}
