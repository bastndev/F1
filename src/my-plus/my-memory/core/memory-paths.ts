/**
 * "My Memory" path constants and the per-CLI instructions-file map.
 *
 * Pure data — no `vscode`, no `fs`, no DOM. Safe to import from anywhere.
 */

/** Folder that holds the generated project context. */
export const MEMORY_DIR = '.f1';
/** Compact, AI-readable project summary inside MEMORY_DIR. */
export const MEMORY_MAP_FILE = 'project-map.md';
/** Built-in working rules inside MEMORY_DIR (content provided by Smart + Skills). */
export const RULES_FILE = 'smart-rules.md';
/** Feature config/state inside MEMORY_DIR (generated). */
export const MEMORY_CONFIG_FILE = 'memory.json';
/** Optional hand-authored config inside MEMORY_DIR (read by the config cascade). */
export const MEMORY_USER_CONFIG_FILE = 'config.json';

/** Markers for the idempotent managed block we write into instruction files. */
export const BLOCK_START = '<!-- F1-MEMORY:START -->';
export const BLOCK_END = '<!-- F1-MEMORY:END -->';

/**
 * AGENTS.md is the single hub every CLI reads — it carries the managed block
 * that points at `.f1/`. Almost every coding CLI (Codex, Cursor, OpenCode,
 * Kiro, Grok, Antigravity, Kilo, and Copilot) reads AGENTS.md directly, so
 * there is no per-CLI file to maintain.
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
