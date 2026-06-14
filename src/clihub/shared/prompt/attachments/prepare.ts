import type { ImageAttachment } from './types';
import { collectImageMarkerIds, substituteMarkersWithPaths } from './markers';

/**
 * Pure function: given the prompt text and attachments that have resolved paths,
 * returns the text ready to be sent to the CLI session.
 * It substitutes the [Image #N] markers with the real paths so the path "appears in the CLI".
 */
export function buildPromptTextWithImages(
	text: string,
	attachments: ImageAttachment[]
): string {
	const referencedIds = collectImageMarkerIds(text);
	const referenced = attachments.filter(a =>
		referencedIds.has(a.id) && isImageAttachment(a)
	);

	// First try direct substitution of markers with paths
	let prepared = substituteMarkersWithPaths(text, referenced);

	// If there were attachments but substitution didn't add extra info, and user wants paths visible,
	// we can optionally append a small section. For now we do pure substitution so the path literally
	// replaces the marker in the user's text (e.g. "look at this [Image #1]" becomes "look at this /path/to/img.png")
	// This matches the goal "la ruta de la imagen sale en el cli".

	return prepared;
}

function isImageAttachment(a: unknown): a is ImageAttachment {
	return !!a && typeof (a as any).id === 'number';
}
