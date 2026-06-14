/**
 * Kiro usage adapter — command: /usage · policy: idle-only (must NOT be
 * injected while a task is running; doing so corrupts the input line).
 */
import { stripAnsi, parsePercent, formatPercent } from '../usage-utils';
import type { ParsedUsage } from '../usage-types';

// Kiro refuses /usage while a task is running — the command merges with the
// queued message and corrupts the input line. So it's "idle-only": we detect
// the working state from the live terminal screen and skip injection.
// Markers Kiro paints while busy: the "kiro is working" status bar and the
// "thinking... (esc to cancel)" line.
export const isKiroBusy = (screenText: string): boolean =>
	/kiro is working|thinking\.{3}/i.test(screenText);

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
