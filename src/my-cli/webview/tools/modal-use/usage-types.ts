/**
 * Shared types for the Use modal: the parsed usage shape (bars / metrics)
 * the renderer consumes, plus the agent-kind discriminator.
 */

export type UsageAgentKind = 'antigravity' | 'claude' | 'codex' | 'kiro';

export type UsageBar = {
	label: string;
	percent: number;
	detail?: string;
	reset?: string;
};

export type UsageMetric = {
	label: string;
	value: string;
};

export type ParsedUsage = {
	title: string;
	summary?: string;
	bars: UsageBar[];
	metrics: UsageMetric[];
	note?: string;
};
