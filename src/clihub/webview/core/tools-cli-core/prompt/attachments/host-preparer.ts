import * as vscode from 'vscode';
import type { ImageAttachment } from './types';
import { buildPromptTextWithImages } from './prepare';

const IMAGE_DIR_NAME = 'clihub-images';

export async function preparePromptForCLI(
	text: string,
	attachments: ImageAttachment[],
	context: vscode.ExtensionContext
): Promise<string> {
	if (!attachments || attachments.length === 0) {
		return text;
	}

	const referencedIds = new Set<number>();
	// We re-collect here to be safe
	for (const m of text.matchAll(/\[Image #(\d+)\]/g)) {
		referencedIds.add(Number(m[1]));
	}

	const toProcess = attachments.filter(a => referencedIds.has(a.id));

	for (const att of toProcess) {
		if (!att.path && att.dataUrl) {
			const savedPath = await saveClipboardImage(att, context);
			if (savedPath) {
				att.path = savedPath;
			}
		}
	}

	// Now build the final text with paths substituted for the markers
	return buildPromptTextWithImages(text, toProcess);
}

async function saveClipboardImage(
	attachment: ImageAttachment,
	context: vscode.ExtensionContext
): Promise<string | undefined> {
	if (!attachment.dataUrl) {
		return undefined;
	}

	const parsed = parseDataUrl(attachment.dataUrl);
	if (!parsed) {
		return undefined;
	}

	const imageDir = vscode.Uri.joinPath(context.globalStorageUri, IMAGE_DIR_NAME);
	await vscode.workspace.fs.createDirectory(imageDir);

	const extension = getImageExtension(parsed.mimeType, attachment.name);
	const fileName = `image-${attachment.id}-${Date.now()}${extension}`;
	const fileUri = vscode.Uri.joinPath(imageDir, fileName);

	await vscode.workspace.fs.writeFile(fileUri, parsed.bytes);

	return fileUri.fsPath;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | undefined {
	const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
	if (!match) {
		return undefined;
	}
	return {
		mimeType: match[1],
		bytes: Buffer.from(match[2], 'base64'),
	};
}

function getImageExtension(mimeType: string, name?: string): string {
	const nameExt = name?.match(/\.[a-z0-9]+$/i)?.[0];
	if (nameExt) {
		return nameExt.toLowerCase();
	}
	switch (mimeType) {
		case 'image/jpeg': return '.jpg';
		case 'image/png': return '.png';
		case 'image/gif': return '.gif';
		case 'image/webp': return '.webp';
		case 'image/svg+xml': return '.svg';
		default: return '.png';
	}
}
