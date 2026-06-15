/**
 * Shared types for the "My Memory" feature — project context management.
 * Importable from both host and webview (no vscode, no DOM).
 */

export type MemoryStatus = 'ready' | 'building' | 'installing' | 'missing-toolchain' | 'error';

export type MemorySnapshot = {
	enabled: boolean;
	status: MemoryStatus;
	lastUpdated?: number;
	projectPath?: string;
	hasGraphJson?: boolean;
	projectMapMd?: boolean;
	/** Whether the graphify toolchain is installed on this machine. */
	hasGraphify?: boolean;
	error?: string;
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
