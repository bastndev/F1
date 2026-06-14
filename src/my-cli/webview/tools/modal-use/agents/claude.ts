/**
 * Claude usage adapter — command: /usage · policy: always (tolerates a
 * usage request in any session state).
 */
import { stripAnsi, parsePercent, formatPercent } from '../usage-utils';
import type { ParsedUsage } from '../usage-types';

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
			{ label: 'Current session', percent: sessionPercent, detail: `resets ${sessionReset}` },
			{ label: 'Current week', percent: weekPercent, detail: `resets ${weekReset}` }
		],
		metrics: [
			{ label: 'session', value: `${formatPercent(sessionPercent)} used` },
			{ label: 'session reset', value: sessionReset },
			{ label: 'week reset', value: weekReset }
		]
	};
};
