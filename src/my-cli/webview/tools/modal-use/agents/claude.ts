/**
 * Claude usage adapter — command: /usage · policy: idle-only.
 */
import { stripAnsi, parsePercent, formatPercent } from '../usage-utils';
import type { ParsedUsage } from '../usage-types';

// Claude can show /usage mid-task, but it interrupts the active run visually and
// may steal focus from the current response. Treat thinking screens as busy.
export const isClaudeBusy = (screenText: string): boolean =>
	/(?:✻\s*)?thinking(?:…|\.{3})|esc to interrupt/i.test(screenText);

const getSection = (text: string, start: RegExp, end: RegExp) => {
	const startMatch = start.exec(text);
	if (!startMatch) {
		return '';
	}

	const rest = text.slice(startMatch.index + startMatch[0].length);
	const endMatch = end.exec(rest);
	return (endMatch ? rest.slice(0, endMatch.index) : rest).trim();
};

export const parseClaudeUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const sessionSection = getSection(text, /current session/i, /current week|what's contributing|usage credits|$|est\. to cancel/i);
	const weekSection = getSection(text, /current week[^\r\n]*/i, /what's contributing|usage credits|$|est\. to cancel/i);
	const sessionPercent = parsePercent(sessionSection.match(/(\d+(?:\.\d+)?)\s*%\s*used/i)?.[1]);
	const weekPercent = parsePercent(weekSection.match(/(\d+(?:\.\d+)?)\s*%\s*used/i)?.[1]);
	const sessionReset = sessionSection.match(/resets\s+([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';
	const weekReset = weekSection.match(/resets\s+([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';

	return {
		title: 'Claude usage',
		summary: `${formatPercent(weekPercent)} week`,
		bars: [
			{ label: 'Current session', percent: 100 - sessionPercent, detail: `resets ${sessionReset}` },
			{ label: 'Current week', percent: 100 - weekPercent, detail: `resets ${weekReset}` }
		],
		metrics: [
			{ label: 'session', value: `${formatPercent(sessionPercent)} used` },
			{ label: 'session reset', value: sessionReset },
			{ label: 'week reset', value: weekReset }
		]
	};
};
