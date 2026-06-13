/**
 * Visual highlighting for atomic tokens inside the prompt textarea.
 * Overlay technique so [Image #1], @mentions, collapsed pastes, skill tokens
 * and misspelled words get distinct backgrounds. We also mirror the user's
 * text selection into the overlay so the standard blue selection background
 * appears correctly when selecting text (including over markers). The real
 * textarea is transparent (text + bg) so the overlay content shows, but the
 * caret is still rendered by the textarea on top (using caret-color).
 */
import { skillsTokenPattern, type SpellIssue } from '../../../shared/prompt';

export function updatePromptImageHighlight(
	wrap: HTMLElement,
	textarea: HTMLTextAreaElement,
	highlight: HTMLElement,
	spellIssues: SpellIssue[] = []
) {
	if (!wrap || !textarea || !highlight) {
		return;
	}

	let selStart = -1;
	let selEnd = -1;
	if (document.activeElement === textarea) {
		selStart = textarea.selectionStart ?? -1;
		selEnd = textarea.selectionEnd ?? -1;
	}

	highlight.replaceChildren(...buildPromptHighlightNodes(textarea.value, selStart, selEnd, spellIssues));

	// keep scroll in sync
	highlight.scrollTop = textarea.scrollTop;
	highlight.scrollLeft = textarea.scrollLeft;
}

type TokenKind = 'image' | 'mention' | 'mention-folder' | 'paste-code' | 'paste-text' | 'skill' | 'numbered-list' | 'misspelled' | 'plain';

function buildPromptHighlightNodes(text: string, selStart: number = -1, selEnd: number = -1, spellIssues: SpellIssue[] = []): Node[] {
	if (!text) {
		return [];
	}

	const nodes: Node[] = [];
	let lastIndex = 0;
	const hasSel = selStart >= 0 && selEnd > selStart;

	// Collect all special tokens (image markers + @file mentions + misspelled words) sorted by position.
	type Token = { start: number; end: number; kind: TokenKind };
	const tokens: Token[] = [];

	for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
		tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind: 'image' });
	}
	// Collapsed-paste markers: [Code #1 +22 lines] (green) / [Text #2 +5 lines] (fuchsia)
	for (const match of text.matchAll(/\[(Code|Text) #\d+ \+\d+ lines?\]/g)) {
		const kind: TokenKind = match[1] === 'Code' ? 'paste-code' : 'paste-text';
		tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind });
	}
	// Skill token: /skill (×1) or /skills #N (×N) — expanded into skill instructions on send.
	for (const match of text.matchAll(skillsTokenPattern)) {
		tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind: 'skill' });
	}
	// Numbered-list prefixes: 1. / 2. / 3. at the start of a line.
	for (const match of text.matchAll(/(^|\n)(\d+\.)/g)) {
		const prefixOffset = match[1].length;
		const start = (match.index ?? 0) + prefixOffset;
		tokens.push({ start, end: start + match[2].length, kind: 'numbered-list' });
	}
	// @mention: '@' followed by any non-whitespace chars, must be preceded by whitespace or start of string
	for (const match of text.matchAll(/(?<=^|\s)@\S+/g)) {
		const kind: TokenKind = match[0].endsWith('/') ? 'mention-folder' : 'mention';
		tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind });
	}
	// Misspelled words flagged by the host spell-checker.
	for (const issue of spellIssues) {
		if (issue.offset >= 0 && issue.length > 0 && issue.offset + issue.length <= text.length) {
			tokens.push({ start: issue.offset, end: issue.offset + issue.length, kind: 'misspelled' });
		}
	}
	// Image/mention tokens take priority over misspelled ones when ranges collide.
	const tokenPriority: Record<TokenKind, number> = { image: 0, mention: 0, 'mention-folder': 0, 'paste-code': 0, 'paste-text': 0, skill: 0, 'numbered-list': 0, misspelled: 1, plain: 2 };
	tokens.sort((a, b) => a.start - b.start || tokenPriority[a.kind] - tokenPriority[b.kind]);

	for (const token of tokens) {
		// Guard against overlapping tokens (should not happen in practice)
		if (token.start < lastIndex) { continue; }

		// plain text before this token
		if (token.start > lastIndex) {
			appendSegment(nodes, text, lastIndex, token.start, selStart, selEnd, hasSel, 'plain');
		}
		// the token itself
		appendSegment(nodes, text, token.start, token.end, selStart, selEnd, hasSel, token.kind);
		lastIndex = token.end;
	}

	// trailing plain text
	if (lastIndex < text.length) {
		appendSegment(nodes, text, lastIndex, text.length, selStart, selEnd, hasSel, 'plain');
	}

	// A trailing newline in a pre-wrap div doesn't create a visual new line
	// unless there's an element after it. Mirroring requires appending a <br>.
	if (text.endsWith('\n')) {
		nodes.push(document.createElement('br'));
	}

	return nodes;
}

/** Append one text segment to the node list, honouring selection overlap. */
function appendSegment(
	nodes: Node[],
	fullText: string,
	from: number,
	to: number,
	selStart: number,
	selEnd: number,
	hasSel: boolean,
	kind: TokenKind
) {
	if (from >= to) { return; }

	const cssClass = kind === 'image' ? 'prompt-image-marker'
				   : kind === 'mention' ? 'prompt-mention'
				   : kind === 'mention-folder' ? 'prompt-mention-folder'
				   : kind === 'paste-code' ? 'prompt-paste-marker prompt-paste-code'
				   : kind === 'paste-text' ? 'prompt-paste-marker prompt-paste-text'
				   : kind === 'skill' ? 'prompt-paste-marker prompt-skill-marker'
				   : kind === 'numbered-list' ? 'prompt-numbered-list'
				   : kind === 'misspelled' ? 'prompt-misspelled'
				   : 'plain';

	const makeSpan = (content: string, cls: string): HTMLSpanElement => {
		const s = document.createElement('span');
		s.className = cls;
		s.textContent = content;
		return s;
	};

	const segmentText = fullText.slice(from, to);

	if (!hasSel || to <= selStart || from >= selEnd) {
		// No selection overlap — simple case
		nodes.push(makeSpan(segmentText, cssClass));
		return;
	}

	// Overlaps selection: split into before / selected / after
	const selFrom = Math.max(from, selStart);
	const selTo   = Math.min(to,   selEnd);

	if (from < selFrom) {
		nodes.push(makeSpan(fullText.slice(from, selFrom), cssClass));
	}

	if (selFrom < selTo) {
		const selSpan = document.createElement('span');
		selSpan.className = 'selected';
		// Nest the token span inside .selected so the badge/colour can be overridden
		selSpan.appendChild(makeSpan(fullText.slice(selFrom, selTo), cssClass));
		nodes.push(selSpan);
	}

	if (selTo < to) {
		nodes.push(makeSpan(fullText.slice(selTo, to), cssClass));
	}
}
