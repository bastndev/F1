/**
 * Antigravity usage adapter — command: /usage · policy: idle-only.
 */
import { stripAnsi, parsePercent, formatPercent, getCleanLine, stripUsageVisualBar, titleCase } from '../usage-utils';
import type { ParsedUsage, UsageBar, UsageMetric } from '../usage-types';

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

		const remainingMatch = cleanLine.match(/(\d+(?:\.\d+)?)\s*%\s*(remaining|left)/i);
		if (!remainingMatch) {
			continue;
		}

		const previousLinePercent = stripUsageVisualBar(lines[index - 1] ?? '')
			.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
		const remaining = parsePercent(previousLinePercent ?? remainingMatch[1]);
		const refresh = cleanLine.match(/refreshes?\s+in\s+([^·\r\n]+)/i)?.[1]?.trim();
		const detail = [
			`${formatPercent(remaining)} remaining`,
			refresh ? `refreshes in ${refresh}` : undefined
		].filter((part): part is string => !!part).join(' - ');

		bars.push({
			label: groupLabel,
			percent: 100 - remaining,
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
