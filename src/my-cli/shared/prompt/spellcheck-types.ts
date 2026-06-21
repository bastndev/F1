export interface SpellIssue {
	offset: number;
	length: number;
	word: string;
	/**
	 * Correction candidates, best-first. Computed during the spellcheck pass so
	 * the Alt-click fix is an instant local replace (no extra round-trip). For
	 * Spanish the known personal-typo correction is placed first.
	 */
	suggestions?: string[];
}
