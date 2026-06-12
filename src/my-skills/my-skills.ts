/**
 * Front door for the future My-Skills extension — the only file code outside
 * src/my-skill/ should import, mirroring src/clihub/clihub.ts.
 *
 * Placeholder for now: the feature will integrate with the standalone
 * My-Skills extension (skills under .agents/skills and .claude/skills; the
 * CLI Hub prompt modal already lists them via workspace.listSkills). When the
 * implementation lands, export its provider/activation surface from here and
 * wire it up in src/extension.ts — and keep CLI Hub code out of this folder.
 */
export {};
