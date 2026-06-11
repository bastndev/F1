import { pasteMarkerPattern } from './pastes';

export const imageMarkerPattern = /\[Image #(\d+)\]/g;

// @file/@folder mentions — same shape the highlight overlay recognizes.
export const mentionTokenPattern = /(?<=^|\s)@\S+/g;

/**
 * Text with all non-typed tokens removed: image markers, collapsed-paste
 * markers, and @mentions. This is what the char counter should measure — the
 * tokens expand/resolve outside the textarea and are never translated, so
 * they shouldn't spend the user's prompt budget.
 */
export function stripPromptTokens(text: string): string {
	return text
		.replace(imageMarkerPattern, '')
		.replace(pasteMarkerPattern, '')
		.replace(mentionTokenPattern, '');
}

export interface ProtectedMention {
	mention: string;
	placeholder: string;
}

/** Shield @mentions from translation — file routes must pass through verbatim. */
export function protectMentions(text: string): { text: string; mentions: ProtectedMention[] } {
	const mentions: ProtectedMention[] = [];
	let index = 0;
	const protectedText = text.replace(mentionTokenPattern, (mention) => {
		const placeholder = `ZXQCLIHUBMNT${index++}QXZ`;
		mentions.push({ mention, placeholder });
		return placeholder;
	});
	return { text: protectedText, mentions };
}

export function restoreMentions(text: string, mentions: ProtectedMention[]): string {
	return mentions.reduce((result, { mention, placeholder }) => {
		return result.split(placeholder).join(mention);
	}, text);
}

export function collectImageMarkerIds(text: string): Set<number> {
	const ids = new Set<number>();
	for (const match of text.matchAll(imageMarkerPattern)) {
		ids.add(Number(match[1]));
	}
	return ids;
}

export function formatPromptTaskText(text: string): string {
	return text.replace(imageMarkerPattern, 'Image $1');
}

export interface ProtectedImageMarker {
	marker: string;
	placeholder: string;
}

export function protectImageMarkers(text: string): { text: string; markers: ProtectedImageMarker[] } {
	const markers: ProtectedImageMarker[] = [];
	const protectedText = text.replace(imageMarkerPattern, (marker, id: string) => {
		const placeholder = `ZXQCLIHUBIMG${id}QXZ`;
		markers.push({ marker, placeholder });
		return placeholder;
	});
	return { text: protectedText, markers };
}

export function restoreImageMarkers(text: string, markers: ProtectedImageMarker[]): string {
	return markers.reduce((result, { marker, placeholder }) => {
		return result.replace(new RegExp(escapeRegExp(placeholder), 'g'), marker);
	}, text);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace [Image #N] markers in the text with the corresponding resolved path from attachments.
 * Used before sending to the CLI so the actual path appears in the terminal input.
 */
export function substituteMarkersWithPaths(text: string, attachments: Array<{ id: number; path?: string; marker: string }>): string {
	let result = text;
	for (const att of attachments) {
		if (att.path) {
			result = result.replace(att.marker, att.path);
		}
	}
	return result;
}
