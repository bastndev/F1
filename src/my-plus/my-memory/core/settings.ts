/**
 * JSON settings helpers for the `.f1/` config files (memory.json, config.json).
 *
 * Reads tolerate hand-edited JSONC (line/block comments and trailing commas);
 * writes go through the atomic writer with a private 0o600 mode. Pure Node, no
 * `vscode`, best-effort — a malformed file reads back as `undefined`, never an
 * exception.
 */

import * as fs from 'fs';
import { atomicWriteFile } from './atomic-write';

/**
 * Strip `//` and block comments and trailing commas, string-safely, so a
 * hand-edited JSONC file still parses. Quotes inside strings are never touched.
 */
const sanitizeJson = (text: string): string => {
	let out = '';
	let inString = false;
	let quote = '';
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		const next = text[i + 1];
		if (inString) {
			out += ch;
			if (ch === '\\') {
				if (next !== undefined) {
					out += next;
					i += 1;
				}
				continue;
			}
			if (ch === quote) {
				inString = false;
			}
			continue;
		}
		if (ch === '"' || ch === '\'') {
			inString = true;
			quote = ch;
			out += ch;
			continue;
		}
		if (ch === '/' && next === '/') {
			i += 2;
			while (i < text.length && text[i] !== '\n') {
				i += 1;
			}
			continue;
		}
		if (ch === '/' && next === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
				i += 1;
			}
			i += 1;
			continue;
		}
		if (ch === ',') {
			let j = i + 1;
			while (j < text.length && /\s/.test(text[j])) {
				j += 1;
			}
			if (text[j] === '}' || text[j] === ']') {
				continue;
			}
		}
		out += ch;
	}
	return out;
};

const looseJsonParse = <T>(text: string): T | undefined => {
	try {
		return JSON.parse(text) as T;
	} catch {
		try {
			return JSON.parse(sanitizeJson(text)) as T;
		} catch {
			return undefined;
		}
	}
};

/** Read a JSON/JSONC settings file. Returns undefined if missing or unparseable. */
export const readJsonSettings = <T>(filePath: string): T | undefined => {
	try {
		return looseJsonParse<T>(fs.readFileSync(filePath, 'utf8'));
	} catch {
		return undefined;
	}
};

/** Drop entries that cannot be serialized cleanly (undefined, functions, NaN…). */
export const validateAndClean = <T extends Record<string, unknown>>(value: T): T => {
	const clean: Record<string, unknown> = {};
	if (!value || typeof value !== 'object') {
		return clean as T;
	}
	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') {
			continue;
		}
		if (typeof entry === 'number' && !Number.isFinite(entry)) {
			continue;
		}
		clean[key] = entry;
	}
	return clean as T;
};

/** Atomically write a settings object as pretty JSON, owner-only (0o600). */
export const writeJsonSettings = (filePath: string, value: Record<string, unknown>): boolean => {
	return atomicWriteFile(filePath, `${JSON.stringify(validateAndClean(value), null, 2)}\n`, 0o600);
};
