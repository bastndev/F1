/**
 * Codex usage adapter — command: /status · policy: idle-only · submit:
 * command then a separate Enter.
 */
import { stripAnsi, parsePercent, formatPercent, clampPercent, getCleanLine, stripUsageVisualBar, titleCase } from '../usage-utils';
import type { ParsedUsage, UsageBar, UsageMetric } from '../usage-types';

// Codex prints /status as inline transcript text, NOT a dismissable overlay.
// So the Use modal must NOT send Esc on close (see isUsageViewInline in the
// registry): with prior conversation, Esc drops the user into Codex's
// backtrack / edit-previous-message pager instead of closing anything.
export const codexUsageIsInline = true;

const parseCompactNumber = (value: string) => Number(value.replace(/[,_\s]/g, ''));

const getCodexResetDetail = (lines: string[], startIndex: number) => {
	for (const line of lines.slice(startIndex + 1, startIndex + 3)) {
		if (/\d+(?:\.\d+)?\s*%\s*(?:used|remaining|left)?/i.test(stripUsageVisualBar(line))) {
			return undefined;
		}

		const reset = line.match(/\(?\s*resets\s+([^)]+?)\s*\)?$/i)?.[1]?.trim();
		if (reset) {
			return reset;
		}
	}
	return undefined;
};

const getCodexPercentBars = (text: string): UsageBar[] => {
	const lines = text.split(/\r?\n/).map(getCleanLine).filter(Boolean);
	const bars: UsageBar[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const cleanLine = stripUsageVisualBar(line);
		// Skip Codex's "context window" line: it's not a quota limit and its
		// "% left" doesn't track the token counts, so it mirrored the 5h limit
		// and read as a duplicate bar. Only the real rate limits stay.
		if (/context\s*window/i.test(cleanLine)) {
			continue;
		}
		const percentMatch = cleanLine.match(/(\d+(?:\.\d+)?)\s*%\s*(used|remaining|left)?/i);
		if (!percentMatch) {
			continue;
		}

		const rawPercent = parsePercent(percentMatch[1]);
		const mode = percentMatch[2]?.toLowerCase();
		const percent = mode === 'remaining' || mode === 'left' ? 100 - rawPercent : rawPercent;
		const labelSource = cleanLine
			.replace(percentMatch[0], '')
			.replace(/\b(used|remaining|left)\b/gi, '')
			.replace(/[:•·-]+$/g, '')
			.trim();
		const label = labelSource ? titleCase(labelSource) : 'Status';
		const reset = getCodexResetDetail(lines, index);
		const details = [
			mode === 'remaining' || mode === 'left' ? `${formatPercent(rawPercent)} ${mode}` : undefined,
			reset ? `resets ${reset}` : undefined
		].filter((detail): detail is string => !!detail);

		bars.push({ label, percent, detail: details.join(' - ') || undefined, reset });
	}

	// The two Codex rate limits (5h + Weekly); the context window is filtered
	// out above, so this stays at both even after a conversation starts.
	return bars.slice(0, 2);
};

const getCodexResetMetricLabel = (label: string) => {
	const cleanLabel = label.toLowerCase().replace(/\s+limit\b/, '').trim();
	return `${cleanLabel || label.toLowerCase()} reset`;
};

const getCodexTokenBar = (text: string): UsageBar | undefined => {
	const tokenLine = text
		.split(/\r?\n/)
		.map(getCleanLine)
		.find((line) => /(token|context|usage)/i.test(line) && /(?:\d[\d,_\s]*)\s*(?:\/|of)\s*(?:\d[\d,_\s]*)/i.test(line));
	const match = tokenLine?.match(/(\d[\d,_\s]*)\s*(?:\/|of)\s*(\d[\d,_\s]*)/i);
	if (!match) {
		return undefined;
	}

	const used = parseCompactNumber(match[1]);
	const total = parseCompactNumber(match[2]);
	if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
		return undefined;
	}

	return {
		label: /context/i.test(tokenLine ?? '') ? 'Context' : 'Tokens',
		percent: clampPercent((used / total) * 100),
		detail: `${match[1].trim()} of ${match[2].trim()}`
	};
};

const getCodexMetric = (text: string, label: string, pattern: RegExp): UsageMetric | undefined => {
	const value = text.match(pattern)?.[1]?.trim();
	if (!value) {
		return undefined;
	}
	return { label, value };
};

export const parseCodexUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const bars = getCodexPercentBars(text);
	const tokenBar = bars.length === 0 ? getCodexTokenBar(text) : undefined;
	if (tokenBar) {
		bars.push(tokenBar);
	}

	const resetMetrics = bars
		.filter((bar) => !!bar.reset)
		.map((bar): UsageMetric => ({
			label: getCodexResetMetricLabel(bar.label),
			value: bar.reset ?? 'unknown'
		}));
	const metrics = [
		...resetMetrics,
		getCodexMetric(text, 'model', /\bmodel\s*[:=]\s*([^\r\n]+)/i),
		getCodexMetric(text, 'approval', /\bapproval(?:s)?\s*[:=]\s*([^\r\n]+)/i),
		getCodexMetric(text, 'sandbox', /\bsandbox\s*[:=]\s*([^\r\n]+)/i)
	].filter((metric): metric is UsageMetric => !!metric).slice(0, 3);

	return {
		title: 'Codex status',
		bars: bars.length > 0 ? bars : [
			{ label: 'Status', percent: 0, detail: 'No usage percentage found in /status output' }
		],
		metrics: metrics.length > 0 ? metrics : [
			{ label: 'command', value: '/status' },
			{ label: 'usage', value: bars.length > 0 ? 'detected' : 'not reported' },
			{ label: 'source', value: 'Codex CLI' }
		],
		note: bars.length > 1
			? undefined
			: 'Codex status output may expose one usage window or only environment status.'
	};
};
