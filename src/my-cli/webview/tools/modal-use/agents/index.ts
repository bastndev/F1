/**
 * Usage agent registry: resolves an active CLI label to its agent kind /
 * command, and dispatches raw output to the matching per-agent parser.
 * CLIs that aren't one of the four supported here fall through to the
 * unsupported path (see unsupported.ts).
 */
import type { CliUsageSnapshot } from '../../tools';
import type { ParsedUsage, UsageAgentKind } from '../usage-types';
import { isAntigravityBusy, parseAntigravityUsage } from './antigravity';
import { parseClaudeUsage } from './claude';
import { codexUsageIsInline, isCodexBusy, parseCodexUsage } from './codex';
import { isKiroBusy, parseKiroUsage } from './kiro';

// Rejection reason used when an "idle-only" CLI is busy: the usage command is
// NOT injected (avoids corrupting the input), and the modal shows an
// in-progress card instead of a failure.
export const USAGE_BUSY_ERROR = 'usage-busy';

// Whether the active CLI can't accept its usage command right now because it
// is mid-task. Only "idle-only" agents (currently Kiro) report busy; every
// other CLI is always ready, so this returns false for them.
export const isUsageAgentBusy = (agentLabel: string, screenText: string): boolean => {
	const kind = getUsageAgentKind(agentLabel);
	if (kind === 'kiro') {
		return isKiroBusy(screenText);
	}
	if (kind === 'antigravity') {
		return isAntigravityBusy(screenText);
	}
	if (kind === 'codex') {
		return isCodexBusy(screenText);
	}
	return false;
};

// Whether the CLI renders usage as inline transcript text (Codex) rather than
// a transient overlay. Inline views must NOT be dismissed with Esc on close —
// for Codex that Esc opens its backtrack/edit-previous pager. Overlay CLIs
// (Claude/Kiro/Antigravity) return false and keep the Esc dismiss.
export const isUsageViewInline = (agentLabel: string): boolean => {
	const kind = getUsageAgentKind(agentLabel);
	if (kind === 'codex') {
		return codexUsageIsInline;
	}
	return false;
};

export const getUsageAgentKind = (agentLabel: string): UsageAgentKind | undefined => {
	const lower = agentLabel.toLowerCase();
	if (lower.includes('antigravity')) {
		return 'antigravity';
	}
	if (lower.includes('claude')) {
		return 'claude';
	}
	if (lower.includes('codex')) {
		return 'codex';
	}
	if (lower.includes('kiro')) {
		return 'kiro';
	}
	return undefined;
};

export const getUsageCommandLabel = (agentLabel: string) => {
	const kind = getUsageAgentKind(agentLabel);
	if (kind === 'codex') {
		return '/status';
	}
	return kind ? '/usage' : 'not configured';
};

export const parseUsage = (snapshot: CliUsageSnapshot): ParsedUsage | undefined => {
	const kind = getUsageAgentKind(snapshot.agentLabel);
	if (kind === 'antigravity') {
		return parseAntigravityUsage(snapshot.raw);
	}
	if (kind === 'claude') {
		return parseClaudeUsage(snapshot.raw);
	}
	if (kind === 'codex') {
		return parseCodexUsage(snapshot.raw);
	}
	if (kind === 'kiro') {
		return parseKiroUsage(snapshot.raw);
	}
	return undefined;
};
