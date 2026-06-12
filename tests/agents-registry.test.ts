/**
 * Invariants for the CLI agent registry (src/shared/agents.ts) and the data
 * files that must stay in sync with it. These guard the "add an agent" flow:
 * one registry entry, one SVG icon, optionally one installer entry.
 *
 * Run with `bun test` (this folder is outside tsconfig's include on purpose;
 * bun executes the TypeScript directly).
 */
import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { allowedAgents, cliAgents, getAgentSlug, getCliAgent } from '../src/shared/agents';
import { cliInstallers } from '../src/host/terminal-cli/cli-installers';

const iconsDir = path.join(import.meta.dir, '..', 'src', 'webview', 'assets', 'icons-cli');

describe('agent registry', () => {
	test('labels are unique and non-empty', () => {
		const labels = cliAgents.map((agent) => agent.label);
		expect(new Set(labels).size).toBe(labels.length);
		for (const label of labels) {
			expect(label.trim().length).toBeGreaterThan(0);
		}
	});

	test('slugs are unique, lowercase, non-empty', () => {
		const slugs = cliAgents.map((agent) => agent.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) {
			expect(slug).toBe(slug.toLowerCase());
			expect(slug.length).toBeGreaterThan(0);
		}
	});

	test('every agent has a non-empty command', () => {
		for (const agent of cliAgents) {
			expect(agent.command.trim().length).toBeGreaterThan(0);
		}
	});

	test('every agent icon file exists in assets/icons-cli', () => {
		for (const agent of cliAgents) {
			const iconPath = path.join(iconsDir, agent.iconFile);
			expect(fs.existsSync(iconPath)).toBe(true);
		}
	});

	test('allowedAgents matches the registry labels', () => {
		expect(allowedAgents.size).toBe(cliAgents.length);
		for (const agent of cliAgents) {
			expect(allowedAgents.has(agent.label)).toBe(true);
		}
	});

	test('getCliAgent resolves every label', () => {
		for (const agent of cliAgents) {
			expect(getCliAgent(agent.label)).toBe(agent);
		}
	});
});

describe('getAgentSlug', () => {
	test('resolves the exact label of every agent', () => {
		for (const agent of cliAgents) {
			expect(getAgentSlug(agent.label)).toBe(agent.slug);
		}
	});

	test('resolves known variants used across the UI', () => {
		expect(getAgentSlug('open code')).toBe('opencode');
		expect(getAgentSlug('github copilot')).toBe('copilot');
	});

	test('returns undefined for unknown labels', () => {
		expect(getAgentSlug('definitely-not-a-cli')).toBeUndefined();
	});
});

describe('installers', () => {
	test('every installer maps to a registry agent with the same command', () => {
		for (const installer of cliInstallers) {
			const agent = getCliAgent(installer.label);
			expect(agent).toBeDefined();
			expect(agent?.command).toBe(installer.command);
		}
	});
});
