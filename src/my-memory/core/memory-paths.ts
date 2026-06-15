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
 * Agent slug (see shared/agents.ts) → instructions file it auto-reads on
 * startup, relative to the workspace root. AGENTS.md is the de-facto cross-CLI
 * standard, so unmapped agents fall back to it.
 */
export const instructionFileBySlug: Record<string, string> = {
	claude: 'CLAUDE.md',
	codex: 'AGENTS.md',
	opencode: 'AGENTS.md',
	kiro: 'AGENTS.md',
	cursor: 'AGENTS.md',
	antigravity: 'AGENTS.md',
	kilocode: 'AGENTS.md',
	grok: 'AGENTS.md',
	copilot: '.github/copilot-instructions.md'
};

/** The instructions file for one CLI slug (AGENTS.md fallback). */
export const instructionFileForSlug = (slug: string | undefined): string => {
	return slug && instructionFileBySlug[slug] ? instructionFileBySlug[slug] : 'AGENTS.md';
};

/** Every distinct instruction file across all known CLIs (for a full sync). */
export const allInstructionFiles = (): string[] => {
	return Array.from(new Set(Object.values(instructionFileBySlug)));
};
