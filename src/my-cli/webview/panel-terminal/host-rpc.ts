/**
 * Request/response helper for webview → extension host round-trips over
 * postMessage. Each call gets a unique id; the host echoes the id back and
 * the matching promise settles. One channel per message type replaces the
 * hand-rolled pending-map + timeout bookkeeping that used to be duplicated
 * for translate, prepare, spellcheck, workspace and clipboard requests.
 */
export type RpcTimeoutPolicy<TResult> =
	| { resolveWith: TResult }
	| { rejectMessage: string };

export type RpcChannel<TArgs extends unknown[], TResult> = {
	/** Send a request to the host and wait for the matching response. */
	request: (...args: TArgs) => Promise<TResult>;
	/** Resolve the pending request for a host response. Unknown ids are ignored. */
	resolve: (id: string, value: TResult) => void;
	/** Reject the pending request for a host error response. Unknown ids are ignored. */
	reject: (id: string, error: Error) => void;
};

type PendingRequest<TResult> = {
	resolve: (value: TResult) => void;
	reject: (reason?: unknown) => void;
	timeout: number;
};

export const createRpcChannel = <TArgs extends unknown[], TResult>(options: {
	/** Id prefix, e.g. 'prompt-translate' → ids 'prompt-translate-1', … */
	prefix: string;
	timeoutMs: number;
	/** What to do when the host never answers. */
	onTimeout: RpcTimeoutPolicy<TResult>;
	/** Post the actual message to the host, tagged with the generated id. */
	send: (id: string, ...args: TArgs) => void;
}): RpcChannel<TArgs, TResult> => {
	const pending = new Map<string, PendingRequest<TResult>>();
	let nextId = 1;

	const take = (id: string) => {
		const entry = pending.get(id);
		if (!entry) {
			return undefined;
		}

		window.clearTimeout(entry.timeout);
		pending.delete(id);
		return entry;
	};

	return {
		request: (...args: TArgs) => {
			const id = `${options.prefix}-${nextId++}`;

			return new Promise<TResult>((resolve, reject) => {
				const timeout = window.setTimeout(() => {
					pending.delete(id);
					if ('resolveWith' in options.onTimeout) {
						resolve(options.onTimeout.resolveWith);
					} else {
						reject(new Error(options.onTimeout.rejectMessage));
					}
				}, options.timeoutMs);

				pending.set(id, { resolve, reject, timeout });
				options.send(id, ...args);
			});
		},
		resolve: (id, value) => {
			take(id)?.resolve(value);
		},
		reject: (id, error) => {
			take(id)?.reject(error);
		}
	};
};
