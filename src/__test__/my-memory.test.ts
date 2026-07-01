/**
 * Type-level smoke tests for my-memory.
 * Validated by `tsc --noEmit` — no test runner required.
 */

import { MemoryService } from '../my-plus/my-memory/my-memory';
import {
	MEMORY_DIR,
	MEMORY_MAP_FILE,
	RULES_FILE,
	MEMORY_CONFIG_FILE,
	BLOCK_START,
	BLOCK_END,
	HUB_FILE,
	CLAUDE_FILE,
	CLAUDE_IMPORT_LINE,
	CLAUDE_SLUG,
} from '../my-plus/my-memory/core/memory-paths';

// memory-paths.ts — constants exist and are strings
const dir: string = MEMORY_DIR;
const mapFile: string = MEMORY_MAP_FILE;
const rules: string = RULES_FILE;
const config: string = MEMORY_CONFIG_FILE;
const startBlock: string = BLOCK_START;
const endBlock: string = BLOCK_END;
const hub: string = HUB_FILE;
const claudeFile: string = CLAUDE_FILE;
const claudeImport: string = CLAUDE_IMPORT_LINE;
const claudeSlug: string = CLAUDE_SLUG;

// memory-service.ts — class compiles and methods exist
const memory = new MemoryService();
const enabled: boolean = memory.isEnabled();
memory.setEnabled(true);
const root: string | undefined = undefined;
memory.writeRules(root, 'content');
const cleaned: string[] = memory.cleanup(root);

void dir;
void mapFile;
void rules;
void config;
void startBlock;
void endBlock;
void hub;
void claudeFile;
void claudeImport;
void claudeSlug;
void enabled;
void cleaned;
