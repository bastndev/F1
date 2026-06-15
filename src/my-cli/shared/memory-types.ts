/**
 * Shared types for the "My Memory" feature — project context management.
 * Importable from both host and webview (no vscode, no DOM).
 */

export type MemoryStatus = 'ready' | 'building' | 'missing-python' | 'error';

export type MemorySnapshot = {
	enabled: boolean;
	status: MemoryStatus;
	lastUpdated?: number;
	projectPath?: string;
	hasGraphJson?: boolean;
	projectMapMd?: boolean;
	error?: string;
};

export type MemoryBuildOptions = {
	installPython?: boolean;
	overwrite?: boolean;
};

export type MemoryBuildResult = {
	success: boolean;
	message: string;
	durationMs?: number;
	error?: string;
	graphJsonCreated?: boolean;
	projectMapEnriched?: boolean;
	filesUpdated?: string[];
};
