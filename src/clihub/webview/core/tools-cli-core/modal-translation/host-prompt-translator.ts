import * as http from 'http';
import * as https from 'https';
import { buildCacheKey, getCachedTranslation, setCachedTranslation } from './cache';
import { decodeHtmlEntities } from './html-entities';
import type { PromptTranslationProviderId, PromptTranslationRequest, PromptTranslationResult } from './types';

const providerNames: Record<PromptTranslationProviderId, string> = {
	myMemory: 'MyMemory',
	googleUnofficial: 'Google Translate',
};

const maxTextLength = 20000;
const myMemoryChunkBytes = 450;
const googleChunkBytes = 1500;
// Above this size MyMemory needs dozens of 450-byte requests, so prefer
// Google (few large chunks, much faster) and keep MyMemory as fallback.
const longTextThresholdChars = 900;
const requestTimeoutMs = 10000;
const rateLimitCooldownMs = 2 * 60 * 1000;
const providerCooldownUntil = new Map<PromptTranslationProviderId, number>();

type ProviderErrorCode = 'rateLimited' | 'unavailable' | 'failed';

class ProviderError extends Error {
	constructor(
		readonly providerId: PromptTranslationProviderId,
		readonly providerName: string,
		readonly code: ProviderErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'ProviderError';
	}
}

class HttpError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
		this.name = 'HttpError';
	}
}

export async function translatePromptToEnglish(request: PromptTranslationRequest): Promise<PromptTranslationResult> {
	const cleanText = request.text.trim();
	if (!cleanText) {
		return {
			text: '',
			providerId: 'myMemory',
			providerName: providerNames.myMemory,
		};
	}

	if (cleanText.length > maxTextLength) {
		throw new Error(`Text is too long. Keep translations under ${maxTextLength} characters.`);
	}

	const from = normalizeSourceLanguage(request.from);
	const to = normalizeTargetLanguage(request.to);
	const cacheKey = buildCacheKey(cleanText, from, to);
	const cached = getCachedTranslation(cacheKey);
	if (cached) {
		return cached;
	}

	const providerOrder: PromptTranslationProviderId[] = cleanText.length > longTextThresholdChars
		? ['googleUnofficial', 'myMemory']
		: ['myMemory', 'googleUnofficial'];

	const errors: ProviderError[] = [];
	for (const providerId of providerOrder) {
		if (isProviderCoolingDown(providerId)) {
			errors.push(new ProviderError(providerId, providerNames[providerId], 'rateLimited', `${providerNames[providerId]} is cooling down.`));
			continue;
		}

		try {
			const result = await translateWithProvider(providerId, cleanText, from, to, request.signal);
			setCachedTranslation(cacheKey, result);
			return result;
		} catch (error) {
			if (request.signal?.aborted) {
				throw new Error('Translation cancelled.');
			}

			const providerError = normalizeProviderError(providerId, error);
			if (providerError.code === 'rateLimited') {
				providerCooldownUntil.set(providerId, Date.now() + rateLimitCooldownMs);
			}
			errors.push(providerError);
		}
	}

	throw buildTranslationFailure(errors);
}

async function translateWithProvider(
	providerId: PromptTranslationProviderId,
	text: string,
	from: string,
	to: string,
	signal?: AbortSignal,
): Promise<PromptTranslationResult> {
	switch (providerId) {
		case 'myMemory':
			return translateWithMyMemory(text, from, to, signal);
		case 'googleUnofficial':
			return translateWithGoogleUnofficial(text, from, to, signal);
	}
}

async function translateWithMyMemory(
	text: string,
	from: string,
	to: string,
	signal?: AbortSignal,
): Promise<PromptTranslationResult> {
	const chunks = chunkTextForTranslation(text, myMemoryChunkBytes);
	const translatedChunks: string[] = [];

	for (const chunk of chunks) {
		throwIfAborted(signal);
		const params = new URLSearchParams({
			q: chunk.text,
			langpair: `${normalizeMyMemoryLanguage(from)}|${normalizeMyMemoryLanguage(to)}`,
			mt: '1',
		});

		const response = await requestJson<MyMemoryResponse>(
			`https://api.mymemory.translated.net/get?${params.toString()}`,
			signal
		);

		if (response.responseStatus && response.responseStatus >= 400) {
			throw new ProviderError(
				'myMemory',
				providerNames.myMemory,
				response.responseStatus === 429 ? 'rateLimited' : 'failed',
				response.responseDetails || 'MyMemory failed.'
			);
		}

		if (typeof response.responseData?.translatedText !== 'string') {
			throw new ProviderError('myMemory', providerNames.myMemory, 'failed', response.responseDetails || 'MyMemory returned an empty response.');
		}

		translatedChunks.push(chunk.prefix + decodeHtmlEntities(response.responseData.translatedText));
	}

	return {
		text: translatedChunks.join(''),
		providerId: 'myMemory',
		providerName: providerNames.myMemory,
	};
}

async function translateWithGoogleUnofficial(
	text: string,
	from: string,
	to: string,
	signal?: AbortSignal,
): Promise<PromptTranslationResult> {
	const chunks = chunkTextForTranslation(text, googleChunkBytes);
	const translatedChunks: string[] = [];

	for (const chunk of chunks) {
		throwIfAborted(signal);
		const params = new URLSearchParams({
			client: 'gtx',
			sl: from === 'auto' ? 'auto' : from,
			tl: to,
			dt: 't',
			q: chunk.text,
		});
		const response = await requestJson<unknown>(
			`https://translate.googleapis.com/translate_a/single?${params.toString()}`,
			signal
		);

		translatedChunks.push(chunk.prefix + parseGoogleTranslateResponse(response));
	}

	return {
		text: translatedChunks.join(''),
		providerId: 'googleUnofficial',
		providerName: providerNames.googleUnofficial,
	};
}

interface MyMemoryResponse {
	responseData?: {
		translatedText?: string;
	};
	responseStatus?: number;
	responseDetails?: string;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
	const responseText = await requestText(url, signal);
	try {
		return JSON.parse(responseText) as T;
	} catch {
		throw new Error('Translation provider returned invalid JSON.');
	}
}

function requestText(urlString: string, signal?: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		throwIfAborted(signal);

		const url = new URL(urlString);
		const transport = url.protocol === 'http:' ? http : https;
		let settled = false;

		const done = (error: Error | undefined, value?: string) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			signal?.removeEventListener('abort', onAbort);

			if (error) {
				reject(error);
			} else {
				resolve(value || '');
			}
		};

		const request = transport.request(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'User-Agent': 'F1 CLI Hub',
			},
		}, (response) => {
			const chunks: string[] = [];
			response.setEncoding('utf8');
			response.on('data', (chunk: string) => {
				chunks.push(chunk);
			});
			response.on('end', () => {
				const body = chunks.join('');
				const statusCode = response.statusCode || 0;
				if (statusCode < 200 || statusCode >= 300) {
					done(new HttpError(statusCode, extractErrorMessage(body) || response.statusMessage || 'Translation request failed.'));
					return;
				}

				done(undefined, body);
			});
		});

		const timeout = setTimeout(() => {
			request.destroy(new Error('Translation request timed out.'));
		}, requestTimeoutMs);

		const onAbort = () => {
			request.destroy(new Error('Translation cancelled.'));
		};

		signal?.addEventListener('abort', onAbort, { once: true });
		request.on('error', (error) => done(error));
		request.end();
	});
}

function parseGoogleTranslateResponse(response: unknown): string {
	if (!Array.isArray(response) || !Array.isArray(response[0])) {
		throw new ProviderError('googleUnofficial', providerNames.googleUnofficial, 'failed', 'Google Translate returned an unexpected response.');
	}

	const text = response[0]
		.map((segment: unknown) => Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '')
		.join('');

	if (!text.trim()) {
		throw new ProviderError('googleUnofficial', providerNames.googleUnofficial, 'failed', 'Google Translate returned an empty response.');
	}

	return decodeHtmlEntities(text);
}

function normalizeProviderError(providerId: PromptTranslationProviderId, error: unknown): ProviderError {
	if (error instanceof ProviderError) {
		return error;
	}

	const providerName = providerNames[providerId];
	const message = error instanceof Error ? error.message : String(error);

	if (error instanceof HttpError) {
		if (error.status === 429) {
			return new ProviderError(providerId, providerName, 'rateLimited', `${providerName} is rate-limiting requests.`);
		}
		return new ProviderError(providerId, providerName, 'failed', `${providerName} failed: ${error.message}`);
	}

	if (/too many requests|status code 429|\b429\b/i.test(message)) {
		return new ProviderError(providerId, providerName, 'rateLimited', `${providerName} is rate-limiting requests.`);
	}

	if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|network|aborted|timeout|timed out/i.test(message)) {
		return new ProviderError(providerId, providerName, 'unavailable', `${providerName} is not reachable.`);
	}

	return new ProviderError(providerId, providerName, 'failed', message || `${providerName} failed.`);
}

function buildTranslationFailure(errors: ProviderError[]): Error {
	if (!errors.length) {
		return new Error('No translation provider is available.');
	}

	const rateLimited = errors.find((error) => error.code === 'rateLimited');
	if (rateLimited) {
		return new Error(`${rateLimited.providerName} is rate-limiting requests and fallback translation failed.`);
	}

	return new Error(errors[errors.length - 1].message);
}

function isProviderCoolingDown(providerId: PromptTranslationProviderId): boolean {
	const cooldownUntil = providerCooldownUntil.get(providerId);
	if (!cooldownUntil) {
		return false;
	}

	if (Date.now() < cooldownUntil) {
		return true;
	}

	providerCooldownUntil.delete(providerId);
	return false;
}

function normalizeSourceLanguage(code: string): string {
	if (!code || code === 'auto') {
		return 'es';
	}

	return code.toLowerCase();
}

function normalizeTargetLanguage(code: string): string {
	return (code || 'en').toLowerCase();
}

function normalizeMyMemoryLanguage(code: string): string {
	if (code === 'zh-cn') {
		return 'zh-CN';
	}
	if (code === 'pt') {
		return 'pt-BR';
	}
	return code;
}

type TextChunk = {
	text: string;
	// Paragraph separator that preceded this chunk in the original text.
	// Kept out of the provider request and re-attached on reassembly, so
	// paragraph structure survives translation untouched.
	prefix: string;
};

function chunkTextForTranslation(text: string, maxBytes: number): TextChunk[] {
	if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
		return [{ text, prefix: '' }];
	}

	// Paragraph units with the blank-line separator that precedes each one.
	const parts = text.split(/(\n[ \t]*\n[\s]*)/);
	const units: { sep: string; body: string }[] = [];
	let pendingSep = '';
	for (let i = 0; i < parts.length; i += 1) {
		if (i % 2 === 1) {
			pendingSep += parts[i];
			continue;
		}
		if (parts[i]) {
			units.push({ sep: pendingSep, body: parts[i] });
			pendingSep = '';
		}
	}

	const chunks: TextChunk[] = [];
	let currentText = '';
	let currentPrefix = '';

	const flush = () => {
		if (currentText) {
			chunks.push({ text: currentText, prefix: currentPrefix });
			currentText = '';
			currentPrefix = '';
		}
	};

	for (const unit of units) {
		if (Buffer.byteLength(unit.body, 'utf8') > maxBytes) {
			flush();
			const pieces = splitByUtf8Bytes(unit.body, maxBytes);
			pieces.forEach((piece, index) => {
				chunks.push({ text: piece, prefix: index === 0 ? unit.sep : '' });
			});
			continue;
		}

		if (!currentText) {
			currentPrefix = unit.sep;
			currentText = unit.body;
			continue;
		}

		const joined = `${currentText}${unit.sep}${unit.body}`;
		if (Buffer.byteLength(joined, 'utf8') > maxBytes) {
			flush();
			currentPrefix = unit.sep;
			currentText = unit.body;
		} else {
			currentText = joined;
		}
	}

	flush();
	return chunks;
}

function splitByUtf8Bytes(text: string, maxBytes: number): string[] {
	const chunks: string[] = [];
	let current = '';
	let currentBytes = 0;

	for (const segment of text.match(/\s+|[^\s]+/g) ?? []) {
		const segmentBytes = Buffer.byteLength(segment, 'utf8');

		if (segmentBytes > maxBytes) {
			if (current) {
				chunks.push(current);
				current = '';
				currentBytes = 0;
			}
			chunks.push(...splitLongSegmentByBytes(segment, maxBytes));
			continue;
		}

		if (current && currentBytes + segmentBytes > maxBytes) {
			chunks.push(current);
			current = segment.trimStart();
			currentBytes = Buffer.byteLength(current, 'utf8');
			continue;
		}

		current += segment;
		currentBytes += segmentBytes;
	}

	if (current) {
		chunks.push(current);
	}

	return chunks;
}

function splitLongSegmentByBytes(segment: string, maxBytes: number): string[] {
	const chunks: string[] = [];
	let current = '';
	let currentBytes = 0;

	for (const char of segment) {
		const charBytes = Buffer.byteLength(char, 'utf8');
		if (current && currentBytes + charBytes > maxBytes) {
			chunks.push(current);
			current = '';
			currentBytes = 0;
		}
		current += char;
		currentBytes += charBytes;
	}

	if (current) {
		chunks.push(current);
	}

	return chunks;
}

function extractErrorMessage(responseText: string): string | undefined {
	if (!responseText) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(responseText) as {
			error?: string | { message?: string };
			message?: string;
		};

		if (typeof parsed.error === 'string') {
			return parsed.error;
		}
		if (typeof parsed.error?.message === 'string') {
			return parsed.error.message;
		}
		if (typeof parsed.message === 'string') {
			return parsed.message;
		}
	} catch {
		return responseText.slice(0, 240);
	}

	return undefined;
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error('Translation cancelled.');
	}
}
