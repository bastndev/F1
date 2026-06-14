/**
 * Usage agent registry: resolves an active CLI label to its agent kind /
 * command, and dispatches raw output to the matching per-agent parser.
 * CLIs that aren't one of the four supported here fall through to the
 * unsupported path (see unsupported.ts).
 */
import type { CliUsageSnapshot } from '../../tools';
import type { ParsedUsage, UsageAgentKind } from '../usage-types';
import { parseAntigravityUsage } from './antigravity';
import { parseClaudeUsage } from './claude';
import { parseCodexUsage } from './codex';
import { parseKiroUsage } from './kiro';

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
