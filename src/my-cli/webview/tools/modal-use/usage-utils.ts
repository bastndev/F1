/**
 * Shared text helpers used by the per-agent parsers and the renderer:
 * ANSI stripping, percent clamping/formatting, line cleaning, title casing.
 */

export const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

export const clampPercent = (value: number) => (
	Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
);

export const parsePercent = (value: string | undefined) => clampPercent(Number(value ?? NaN));

export const formatPercent = (value: number) => `${clampPercent(value).toFixed(1)}%`;

export const getCleanLine = (line: string) => line
	.replace(/[│┃║|]/g, ' ')
	.replace(/\s+/g, ' ')
	.trim();

export const stripUsageVisualBar = (line: string) => line
	.replace(/\[[\s█▓▒░#=+\-.▏▎▍▌▋▊▉■□▁▂▃▄▅▆▇━─]{3,}\]/g, ' ')
	.replace(/[█▓▒░▏▎▍▌▋▊▉■□▁▂▃▄▅▆▇]{3,}/g, ' ')
	.replace(/\s+/g, ' ')
	.trim();

export const titleCase = (value: string) => value
	.replace(/[_-]+/g, ' ')
	.replace(/\b\w/g, (char) => char.toUpperCase())
	.trim();
