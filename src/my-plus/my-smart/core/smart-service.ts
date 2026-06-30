/**
 * "Smart + Skills" orchestrator (host / Node).
 *
 * On a Smart-mode launch it builds cheap project context (a graphify code-graph)
 * and writes the rules into .f1/, then the host TYPES ONE PROMPT into the CLI so
 * the agent actively reads the graph + rules and is genuinely primed — the
 * "I am ready for work ✅" comes from the CLI itself, in the chat. The generated
 * files are cleaned up after the agent's first reply settles.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryService } from '../../my-memory/my-memory';
import { SMART_READY_MESSAGE } from './smart-paths';

const GRAPHIFY_OUT_DIR = 'graphify-out';
const GRAPH_REPORT_REL = 'graphify-out/GRAPH_REPORT.md';
const RULES_REL = '.f1/smart-rules.md';
const GRAPH_BUILD_TIMEOUT_MS = 30000;

export class SmartService {
	private readonly memory = new MemoryService();

	/** Write the built-in rules into .f1/smart-rules.md (best-effort). */
	public writeRules(root: string | undefined, rulesContent: string | undefined): void {
		if (rulesContent) {
			this.memory.writeRules(root, rulesContent);
		}
	}

	/** Prepare project context (.f1/ map + instruction files) before a session starts. */
	public prepareContext(root: string | undefined, agentSlug: string | undefined): void {
		this.memory.onLaunch(root, agentSlug);
	}

	/**
	 * Run `graphify update .` (re-extract the code graph — no LLM, free) to produce
	 * graphify-out/GRAPH_REPORT.md, the compact map the CLI reads. Resolves true if
	 * the report was produced. Best-effort: missing graphify / failure → false.
	 */
	public buildGraph(root: string | undefined): Promise<boolean> {
		return new Promise((resolve) => {
			if (!root) {
				resolve(false);
				return;
			}

			let child: ReturnType<typeof spawn>;
			try {
				child = spawn('graphify', ['update', '.'], { cwd: root, stdio: 'ignore' });
			} catch {
				resolve(false);
				return;
			}

			const timer = setTimeout(() => {
				try { child.kill(); } catch { /* already gone */ }
				resolve(false);
			}, GRAPH_BUILD_TIMEOUT_MS);

			child.on('error', () => {
				clearTimeout(timer);
				resolve(false);
			});
			child.on('exit', (code) => {
				clearTimeout(timer);
				resolve(code === 0 && fs.existsSync(path.join(root, GRAPH_REPORT_REL)));
			});
		});
	}

	/** The single-line prompt the host types into the CLI on launch. */
	public composePrompt(hasGraph: boolean): string {
		const parts = [
			`Before we start, read \`./${RULES_REL}\` for how I want you to work in this project, and follow those rules from now on.`,
			hasGraph
				? `Also read \`./${GRAPH_REPORT_REL}\` — a compact code-graph of this project — so you grasp the structure without scanning every file.`
				: 'Take a quick look at the project structure so you understand it.',
			`Keep this first reply short, then end it with exactly: ${SMART_READY_MESSAGE}`
		];
		return parts.join(' ');
	}

	/** Remove the generated .f1/ and graphify-out/ once the agent has read them. */
	public cleanup(root: string | undefined): void {
		this.memory.cleanup(root);
		if (!root) {
			return;
		}
		try {
			const out = path.join(root, GRAPHIFY_OUT_DIR);
			if (fs.existsSync(out)) {
				fs.rmSync(out, { recursive: true, force: true });
			}
		} catch (error) {
			console.error('[smart] cleanup graphify-out failed:', error);
		}
	}
}
