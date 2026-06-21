import type { VoiceState } from '../../shared/voice/voice-types';
import type { VoiceResources } from './host-voice-tts';
import type { InboundWebviewMessage } from '../../shared/protocol';

const maxVoiceTotalChars = 60000;
const maxVoiceChunkChars = 1400;
const maxVoiceChunks = 120;

export type ActiveVoiceSession = {
	chunks: string[];
	index: number;
	state: VoiceState;
	/** Language of the spoken text — selects the Piper voice. */
	lang: string;
	resources?: VoiceResources;
};

function normalizeVoiceText(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function splitLongVoiceSegment(segment: string, maxChars: number): string[] {
	const chunks: string[] = [];
	let current = '';

	for (const part of segment.match(/\s+|\S+/g) ?? []) {
		if (part.length > maxChars) {
			if (current.trim()) {
				chunks.push(current.trim());
			}
			current = '';
			for (let index = 0; index < part.length; index += maxChars) {
				chunks.push(part.slice(index, index + maxChars));
			}
			continue;
		}

		if (current && current.length + part.length > maxChars) {
			chunks.push(current.trim());
			current = part.trimStart();
			continue;
		}

		current += part;
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks;
}

function splitVoiceText(text: string, maxChars: number): string[] {
	const clean = normalizeVoiceText(text);
	if (!clean) {
		return [];
	}
	if (clean.length <= maxChars) {
		return [clean];
	}

	const chunks: string[] = [];
	let current = '';
	const flush = () => {
		if (current.trim()) {
			chunks.push(current.trim());
			current = '';
		}
	};

	const paragraphs = clean.split(/\n{2,}/);
	for (const paragraph of paragraphs) {
		const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [paragraph];
		for (const sentence of sentences) {
			const piece = sentence.trim();
			if (!piece) {
				continue;
			}
			if (piece.length > maxChars) {
				flush();
				chunks.push(...splitLongVoiceSegment(piece, maxChars));
				continue;
			}
			const next = current ? `${current} ${piece}` : piece;
			if (next.length > maxChars) {
				flush();
				current = piece;
			} else {
				current = next;
			}
		}
		flush();
	}

	return chunks;
}

export function normalizeVoiceChunks(message: InboundWebviewMessage): string[] {
	const rawChunks = Array.isArray(message.chunks)
		? message.chunks.filter((chunk): chunk is string => typeof chunk === 'string')
		: (typeof message.text === 'string' ? [message.text] : []);

	const chunks: string[] = [];
	let totalChars = 0;

	for (const raw of rawChunks) {
		for (const piece of splitVoiceText(raw, maxVoiceChunkChars)) {
			const remaining = maxVoiceTotalChars - totalChars;
			if (remaining <= 0 || chunks.length >= maxVoiceChunks) {
				return chunks;
			}

			const value = piece.length > remaining ? piece.slice(0, remaining).trimEnd() : piece;
			if (!value) {
				continue;
			}

			chunks.push(value);
			totalChars += value.length;
		}
	}

	return chunks;
}
