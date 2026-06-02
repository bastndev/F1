export interface ImageAttachment {
	id: number;
	marker: string;
	source: 'path' | 'clipboard';
	path?: string;
	dataUrl?: string;
	type?: string;
	name?: string;
	size?: number;
}

export function isImageAttachment(value: unknown): value is ImageAttachment {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const a = value as Partial<ImageAttachment>;
	return typeof a.id === 'number'
		&& typeof a.marker === 'string'
		&& (a.source === 'path' || a.source === 'clipboard')
		&& (a.path === undefined || typeof a.path === 'string')
		&& (a.dataUrl === undefined || typeof a.dataUrl === 'string')
		&& (a.type === undefined || typeof a.type === 'string')
		&& (a.name === undefined || typeof a.name === 'string')
		&& (a.size === undefined || typeof a.size === 'number');
}

export interface PreparePromptRequest {
	text: string;
	attachments: ImageAttachment[];
}

export interface PreparePromptResult {
	text: string;
}
