export const imageMarkerPattern = /\[Image #(\d+)\]/g;

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
