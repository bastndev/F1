/**
 * "My Memory" path constants and the per-CLI instructions-file map.
 *
 * Pure data — no `vscode`, no `fs`, no DOM. Safe to import from anywhere.
 * The `.f1/` folder is committed to the repo so a team shares one context map.
 */

/** Committed folder that holds the shared project context. */
export const MEMORY_DIR = '.f1';
/** Compact, AI-readable project summary inside MEMORY_DIR. */
export const MEMORY_MAP_FILE = 'project-map.md';
/** Feature config/state inside MEMORY_DIR. */
export const MEMORY_CONFIG_FILE = 'memory.json';
/** Optional dependency graph (Tier 2 / graphify) inside MEMORY_DIR. */
export const MEMORY_GRAPH_FILE = 'graph.json';

/** Markers for the idempotent managed block we write into instruction files. */
export const BLOCK_START = '<!-- F1-MEMORY:START -->';
export const BLOCK_END = '<!-- F1-MEMORY:END -->';

/**
 * AGENTS.md is the single hub every CLI reads — it carries the managed block
 * that points at `.f1/`. Almost every coding CLI (Codex, Cursor, OpenCode,
 * Kiro, Grok, Antigravity, Kilo, and now Copilot) reads AGENTS.md directly, so
 * there is no per-CLI file to maintain and no `.github/copilot-instructions.md`.
 */
export const HUB_FILE = 'AGENTS.md';

/**
 * Claude Code is the one holdout: it keys off CLAUDE.md and won't read AGENTS.md
 * on its own. So CLAUDE.md is kept as a thin pointer that imports the hub —
 * never a second copy of the block, so the hub stays the single source of truth.
 */
export const CLAUDE_FILE = 'CLAUDE.md';
/** The line Claude Code uses to import AGENTS.md into CLAUDE.md. */
export const CLAUDE_IMPORT_LINE = '@AGENTS.md';
/** Agent slug (see shared/agents.ts) whose CLI keys off CLAUDE.md. */
export const CLAUDE_SLUG = 'claude';

/** graphify's working directory (cache + intermediate files). */
export const GRAPHIFY_OUT_DIR = 'graphify-out';
/** Comment line we add to .gitignore when ignoring graphify-out/. */
export const GRAPHIFY_IGNORE_COMMENT = "# F1 My Memory: graphify's working dir + cache (committed context is in .f1/)";

/** VS Code extension packaging ignore list (used by vsce when building a .vsix). */
export const VSCODE_IGNORE_FILE = '.vscodeignore';
/** Comment line we add to .vscodeignore when keeping context out of the package. */
export const VSCODE_IGNORE_COMMENT = '# F1 My Memory: keep project context out of the packaged extension';
