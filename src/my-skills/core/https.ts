/**
 * Shared hardened HTTPS GET for the My Skills host side. One implementation —
 * moved out of marketplace.ts — replaces the three hand-rolled fetchers that
 * had drifted apart: redirects are capped at 5 and only followed same-host
 * (or between skills.sh and www.skills.sh), gzip/brotli/deflate responses are
 * decompressed, every request times out, and callers can bound the body size
 * (aborted mid-stream once exceeded). Custom headers are merged last so they
 * can override the defaults (e.g. the GitHub API's Accept).
 */
import * as https from 'https';
import * as zlib from 'zlib';

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 5;

export interface HttpGetOptions {
	headers?: Record<string, string>;
	/** Request timeout; defaults to 12s (the marketplace's long-standing ceiling). */
	timeoutMs?: number;
	/** Reject once the (decompressed) body grows past this many bytes. */
	maxBytes?: number;
}

export function httpGetJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
	return httpGet(url, 'application/json', { headers }).then(response => JSON.parse(response) as T);
}

export function httpGet(url: string, accept: string, options: HttpGetOptions = {}): Promise<string> {
	return httpGetWithRedirects(url, accept, options, 0);
}

function httpGetWithRedirects(url: string, accept: string, options: HttpGetOptions, redirectCount: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const request = https.get(
			url,
			{
				headers: {
					'User-Agent': 'MySkillsExtension/0.1',
					Accept: accept,
					'Accept-Encoding': 'gzip, deflate, br',
					...options.headers,
				},
				timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			},
			response => {
				if (
					response.statusCode
					&& response.statusCode >= 300
					&& response.statusCode < 400
					&& response.headers.location
				) {
					const redirectUrl = resolveAllowedRedirectUrl(url, response.headers.location);
					response.resume();
					if (!redirectUrl) {
						reject(new Error('Blocked unsafe redirect'));
						return;
					}
					if (redirectCount >= MAX_REDIRECTS) {
						reject(new Error('Too many redirects'));
						return;
					}

					httpGetWithRedirects(redirectUrl, accept, options, redirectCount + 1).then(resolve).catch(reject);
					return;
				}

				if (response.statusCode && response.statusCode !== 200) {
					reject(new Error(`HTTP ${response.statusCode}`));
					return;
				}

				const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
				let stream: NodeJS.ReadableStream = response;

				if (encoding.includes('gzip')) {
					stream = response.pipe(zlib.createGunzip());
				} else if (encoding.includes('br')) {
					stream = response.pipe(zlib.createBrotliDecompress());
				} else if (encoding.includes('deflate')) {
					stream = response.pipe(zlib.createInflate());
				}

				let data = '';
				let receivedBytes = 0;
				stream.on('data', chunk => {
					const text = chunk.toString();
					receivedBytes += Buffer.byteLength(text);
					if (options.maxBytes !== undefined && receivedBytes > options.maxBytes) {
						request.destroy(new Error('Response too large'));
						return;
					}
					data += text;
				});
				stream.on('end', () => resolve(data));
				stream.on('error', reject);
			},
		);

		request.on('timeout', () => {
			request.destroy(new Error('Request timed out'));
		});
		request.on('error', reject);
	});
}

function resolveAllowedRedirectUrl(currentUrl: string, location: string): string | undefined {
	try {
		const current = new URL(currentUrl);
		const next = new URL(location, current);
		if (next.protocol !== 'https:' || !isAllowedRedirectHost(current.hostname, next.hostname)) {
			return undefined;
		}

		return next.toString();
	} catch {
		return undefined;
	}
}

function isAllowedRedirectHost(currentHost: string, nextHost: string): boolean {
	if (nextHost === currentHost) {
		return true;
	}

	const skillsHosts = new Set(['skills.sh', 'www.skills.sh']);
	return skillsHosts.has(currentHost) && skillsHosts.has(nextHost);
}
