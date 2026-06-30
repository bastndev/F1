/**
 * Type-level smoke tests for my-cli.
 * Validated by `tsc --noEmit` — no test runner required.
 */

import type { CliAgent } from '../my-cli/shared/agents';
import { cliAgents, allowedAgents, getCliAgent, getAgentSlug } from '../my-cli/shared/agents';
import type {
	CliSessionSnapshot,
	CliSessionStatus,
	WebviewToHostMessage,
	HostToWebviewMessage,
	PtyHostCommand,
	PtyHostEvent,
	CustomCliLaunch,
} from '../my-cli/shared/protocol';
import type { ActiveVoiceSession } from '../my-cli/core/voice/voice-chunks';
import type { VoicePostMessage } from '../my-cli/core/voice/voice-controller';

// agents.ts — registry is non-empty and every agent has required fields
const agent: CliAgent = cliAgents[0];
const label: string = agent.label;
const command: string = agent.command;
const slug: string = agent.slug;
const has: boolean = allowedAgents.has(label);
const found: CliAgent | undefined = getCliAgent(label);
const resolved: string | undefined = getAgentSlug(label);

// protocol.ts — message types are assignable
const sessionStatus: CliSessionStatus = 'running';
const customLaunch: CustomCliLaunch = { label: 'test', command: 'test', args: [] };

// voice-controller.ts — VoicePostMessage signature compiles
const postMessage: VoicePostMessage = (msg) => {
	void msg;
	return Promise.resolve(true);
};

// Verify key exports exist (compile-time only)
void label;
void command;
void slug;
void has;
void found;
void resolved;
void sessionStatus;
void customLaunch;
void postMessage;
