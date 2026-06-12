/**
 * Fuzzy subsequence matcher for the @file mention picker, VS Code
 * quick-open style: every query character must appear in the target in
 * order, but not contiguously — "test-pro" matches "test-del-projecto.ts".
 * Pure logic (no DOM) so any picker UI can reuse it; the component under
 * src/clihub/webview/tools owns rendering, per the shared/webview split.
 */

export type FuzzyMatch = {
	/** Higher is better. Only comparable between matches for the same query. */
	score: number;
	/** Indices of the matched characters in the target string. */
	positions: number[];
};

const separators = new Set([' ', '-', '_', '.', '/', '\\']);

export function fuzzyMatch(query: string, target: string): FuzzyMatch | undefined {
	if (!query) {
		return { score: 0, positions: [] };
	}
	if (query.length > target.length) {
		return undefined;
	}

	const q = query.toLowerCase();
	const t = target.toLowerCase();

	const positions: number[] = [];
	let score = 0;
	let searchFrom = 0;

	for (const char of q) {
		const index = t.indexOf(char, searchFrom);
		if (index === -1) {
			return undefined;
		}

		let charScore = 1;
		// Word-boundary hits (start of target or right after a separator) are
		// the strongest signal — "tdp" should love "test-del-projecto".
		if (index === 0 || separators.has(t[index - 1])) {
			charScore += 8;
		}
		// Consecutive runs beat scattered hits with the same boundaries.
		const previous = positions.length > 0 ? positions[positions.length - 1] : -1;
		if (previous === index - 1) {
			charScore += 5;
		}
		// Gaps cost a little, so tighter alignments rank first.
		const gap = previous >= 0 ? index - previous - 1 : index;
		score += charScore - Math.min(gap, 3) * 0.5;

		positions.push(index);
		searchFrom = index + 1;
	}

	// All else equal, prefer shorter targets.
	score -= target.length * 0.01;

	return { score, positions };
}
