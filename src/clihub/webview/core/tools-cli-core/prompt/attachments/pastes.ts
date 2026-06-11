/**
 * Collapsed-paste support for the prompt chat, mirroring the [Image #N]
 * attachment system: a large pasted block becomes a compact atomic marker
 * ("[Code #1 +22 lines]" / "[Text #1 +22 lines]") in the textarea, and is
 * expanded back to the original verbatim content just before sending to the
 * CLI. Content is stored untouched — no lowercasing, no translation.
 */

export type PasteKind = 'code' | 'text';

export interface PasteAttachment {
	id: number;
	marker: string;
	kind: PasteKind;
	content: string;
}

export const pasteMarkerPattern = /\[(Code|Text) #(\d+) \+\d+ lines?\]/g;

const collapseMinLines = 4;
const collapseMinChars = 300;

/** A paste is collapsed when it would visually flood the textarea. */
export function shouldCollapsePaste(text: string): boolean {
	if (!text) {
		return false;
	}
	return countLines(text) >= collapseMinLines || text.length >= collapseMinChars;
}

export function buildPasteMarker(kind: PasteKind, id: number, lineCount: number): string {
	const label = kind === 'code' ? 'Code' : 'Text';
	return `[${label} #${id} +${lineCount} ${lineCount === 1 ? 'line' : 'lines'}]`;
}

export function countLines(text: string): number {
	return text.split('\n').length;
}

// Signals that a pasted block is source code rather than prose. Each hit adds
// a point; ≥2 points classifies as code. Tuned to be cheap, not perfect — a
// wrong guess only changes the badge colour, never the sent content.
const codeSignals: RegExp[] = [
	/```/,
	/\b(function|const|let|var|class|import|export|return|def|fn|pub|async|await|interface|enum|struct|impl)\b/,
	/=>|::|->|&&|\|\||!==|===/,
	/[;{}]\s*$/m,
	/^\s*(?:#include|using|package|namespace|from\s+\S+\s+import)\b/m,
	/<\/?[a-z][\w-]*(?:\s[^<>]*)?>/i,
	/^\s{2,}\S|^\t/m,
	/[\w$]+\([^()\n]*\)/,
];

export function detectPasteKind(text: string): PasteKind {
	let score = 0;
	for (const signal of codeSignals) {
		if (signal.test(text)) {
			score++;
		}
		if (score >= 2) {
			return 'code';
		}
	}
	return 'text';
}

/** Replace each known paste marker with its stored original content. */
export function expandPasteMarkers(text: string, pastes: PasteAttachment[]): string {
	let result = text;
	for (const paste of pastes) {
		result = result.split(paste.marker).join(paste.content);
	}
	return result;
}

export interface ProtectedPasteMarker {
	marker: string;
	placeholder: string;
}

/** Shield paste markers from translation, mirroring protectImageMarkers. */
export function protectPasteMarkers(text: string): { text: string; markers: ProtectedPasteMarker[] } {
	const markers: ProtectedPasteMarker[] = [];
	const protectedText = text.replace(pasteMarkerPattern, (marker, _kind: string, id: string) => {
		const placeholder = `ZXQCLIHUBPST${id}QXZ`;
		markers.push({ marker, placeholder });
		return placeholder;
	});
	return { text: protectedText, markers };
}

export function restorePasteMarkers(text: string, markers: ProtectedPasteMarker[]): string {
	return markers.reduce((result, { marker, placeholder }) => {
		return result.split(placeholder).join(marker);
	}, text);
}
