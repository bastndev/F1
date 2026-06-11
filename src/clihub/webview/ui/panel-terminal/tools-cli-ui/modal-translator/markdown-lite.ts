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

const escapeHtml = (text: string): string =>
	text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

function renderInline(text: string): string {
	let out = escapeHtml(text);

	// Pull inline code out first so bold/italic markers inside it stay literal.
	const codeSpans: string[] = [];
	out = out.replace(/`([^`]+)`/g, (_match, code: string) => {
		codeSpans.push(code);
		return `\u0000${codeSpans.length - 1}\u0000`;
	});

	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
	out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a class="md-link" href="$2">$1</a>');

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
