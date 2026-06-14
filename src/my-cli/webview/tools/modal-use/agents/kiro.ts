/**
 * Kiro usage adapter — command: /usage · policy: idle-only (must NOT be
 * injected while a task is running; doing so corrupts the input line).
 */
import { stripAnsi, parsePercent, formatPercent } from '../usage-utils';
import type { ParsedUsage } from '../usage-types';

export const parseKiroUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const plan = text.match(/resets on\s+[0-9-]+\s*\|\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'Kiro usage';
	const reset = text.match(/resets on\s+([0-9-]+)/i)?.[1]?.trim() ?? 'unknown';
	const credits = text.match(/credits\s*\(([^)]+)\)/i)?.[1]?.trim() ?? 'unknown';
	const percent = parsePercent(text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]);
	const overages = text.match(/overages:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';

	return {
		title: plan,
		summary: formatPercent(percent),
		bars: [
			{ label: 'Usage', percent, detail: `resets ${reset}` }
		],
		metrics: [
			{ label: 'credits', value: credits },
			{ label: 'resets', value: reset },
			{ label: 'overages', value: overages }
		],
		note: 'This CLI currently reports a single usage window.'
	};
};
