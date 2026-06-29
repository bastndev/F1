/**
 * Antigravity usage adapter — command: /usage · policy: idle-only.
 */
import { stripAnsi, parsePercent, formatPercent, getCleanLine, stripUsageVisualBar, titleCase } from '../usage-utils';
import type { ParsedUsage, UsageBar, UsageMetric } from '../usage-types';

// Antigravity is idle-only: injecting /usage mid-task corrupts the input
// AND the running spinner redraws duplicate the captured usage rows. Detect
// the working state from the live terminal screen and skip injection.
// Markers while busy: the "working..." spinner and the "esc to cancel" status
// bar shown during a cancellable task.
export const isAntigravityBusy = (screenText: string): boolean =>
	/working\.{3}|esc to cancel/i.test(screenText);

const getAntigravityGroupLabel = (value: string) => titleCase(value)
	.replace(/\bAnd\b/g, 'and')
	.replace(/\bGpt\b/g, 'GPT');

const getAntigravityMetricLabel = (label: string) => {
	const normalized = label
		.toLowerCase()
		.replace(/\s+models\b/g, '')
		.replace(/\s+and\s+/g, '/')
		.trim();
	return `${normalized || label.toLowerCase()} refresh`;
};

export const parseAntigravityUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const lines = text.split(/\r?\n/).map(getCleanLine).filter(Boolean);
	const bars: UsageBar[] = [];
	let groupLabel = 'Weekly limit';

	for (let index = 0; index < lines.length; index += 1) {
		const cleanLine = stripUsageVisualBar(lines[index]);
		if (!cleanLine) {
			continue;
		}

		if (/models?$/i.test(cleanLine) && !/models within/i.test(cleanLine)) {
			groupLabel = getAntigravityGroupLabel(cleanLine);
			continue;
		}

		const infoMatch = cleanLine.match(/(?:(\d+(?:\.\d+)?)\s*%\s*(?:remaining|left))|(?:quota\s+available)/i);
		if (!infoMatch) {
			continue;
		}

		const isQuotaAvailable = /quota\s+available/i.test(cleanLine);
		const previousLinePercent = stripUsageVisualBar(lines[index - 1] ?? '')
			.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
		const remaining = parsePercent(isQuotaAvailable ? (previousLinePercent ?? '100') : (previousLinePercent ?? infoMatch[1]));
		const refresh = cleanLine.match(/refreshes?\s+in\s+([^·\r\n]+)/i)?.[1]?.trim();
		const detail = [
			isQuotaAvailable ? 'Quota available' : `${formatPercent(remaining)} remaining`,
			refresh ? `refreshes in ${refresh}` : undefined
		].filter((part): part is string => !!part).join(' - ');

		bars.push({
			label: groupLabel,
			percent: remaining,
			detail,
			reset: refresh
		});
	}

	const metrics = bars
		.filter((bar) => !!bar.reset)
		.map((bar): UsageMetric => ({
			label: getAntigravityMetricLabel(bar.label),
			value: bar.reset ?? 'unknown'
		}))
		.slice(0, 3);

	return {
		title: 'Antigravity usage',
		summary: bars.length === 1 ? '1 weekly group' : bars.length > 1 ? `${bars.length} weekly groups` : '/usage',
		bars: bars.length > 0 ? bars : [
			{ label: 'Weekly limit', percent: 0, detail: 'No usage percentage found in /usage output' }
		],
		metrics: metrics.length > 0 ? metrics : [
			{ label: 'command', value: '/usage' },
			{ label: 'usage', value: bars.length > 0 ? 'detected' : 'not reported' },
			{ label: 'source', value: 'Antigravity CLI' }
		]
	};
};
