/**
 * Shared loading-state machine for the single-value install panels (trending,
 * flame, official sources). Each one fetched its data through the identical
 * guard → cache → load → error → settle shape, so this collapses that
 * duplication into one reusable section.
 *
 * The provider still owns how a section's data becomes a webview message (via
 * the `send` callback), so panel-specific payload fields stay where they belong.
 *
 * Cache semantics intentionally match the originals: a section is considered
 * cached only while `hasData` holds, so an empty (or failed) result re-fetches
 * on the next non-refresh request. The paged all-time list and the per-owner
 * official-skills map cache differently and keep their own bespoke logic.
 */
export class AsyncListSection<T> {
	data: T;
	isLoading = false;
	error: string | null = null;

	constructor(
		initial: T,
		private readonly _hasData: (data: T) => boolean,
		private readonly _emptyError?: (data: T) => string | null,
	) {
		this.data = initial;
	}

	async load(options: {
		refresh: boolean;
		fetch: () => Promise<T>;
		send: () => Promise<void>;
	}): Promise<void> {
		if (this.isLoading) {
			await options.send();
			return;
		}

		if (!options.refresh && this._hasData(this.data)) {
			await options.send();
			return;
		}

		this.isLoading = true;
		this.error = null;
		await options.send();

		try {
			this.data = await options.fetch();
			const emptyError = this._emptyError?.(this.data);
			if (emptyError) {
				this.error = emptyError;
			}
		} catch (err) {
			this.error = err instanceof Error ? err.message : String(err);
		} finally {
			this.isLoading = false;
			await options.send();
		}
	}
}
