export type AgentLaunchSource = 'launcher' | 'panel';
export type AgentLaunchExtensionMode = 'development' | 'production' | 'test' | 'unknown';

export type AgentLaunchGuardContext = {
	source: AgentLaunchSource;
	extensionMode: AgentLaunchExtensionMode;
};

export type AgentLaunchGuardMessage = {
	id: string;
	agentLabel: string;
	confirmLabel: string;
	cancelLabel: string;
	message: string;
	detail: string;
};

type AgentLaunchGuardPolicy = {
	id: string;
	matches: (agentLabel: string) => boolean;
	createMessage: (agentLabel: string, context: AgentLaunchGuardContext) => AgentLaunchGuardMessage;
};

const isCodexAgent = (agentLabel: string) => {
	return agentLabel.toLowerCase().includes('codex');
};

const createCodexDetail = (context: AgentLaunchGuardContext) => {
	if (context.extensionMode === 'development') {
		return 'F1 is running in an Extension Development Host. If Codex is already open in your main IDE or terminal, opening another Codex CLI can interrupt or force re-authentication in the active session.';
	}

	if (context.source === 'launcher') {
		return 'If Codex is already open in another terminal or IDE, opening it from F1 can interrupt or force re-authentication in that active session.';
	}

	return 'Codex sessions share account state outside F1. Opening another interactive Codex can interrupt an active Codex session elsewhere.';
};

const agentLaunchGuardPolicies: AgentLaunchGuardPolicy[] = [
	{
		id: 'codex-interactive-session',
		matches: isCodexAgent,
		createMessage: (agentLabel, context) => ({
			id: 'codex-interactive-session',
			agentLabel,
			confirmLabel: 'Open Codex',
			cancelLabel: 'Cancel',
			message: 'Open Codex CLI?',
			detail: createCodexDetail(context)
		})
	}
];

export const getAgentLaunchGuardMessage = (
	agentLabel: string,
	context: AgentLaunchGuardContext
) => {
	const policy = agentLaunchGuardPolicies.find((entry) => entry.matches(agentLabel));
	return policy?.createMessage(agentLabel, context);
};

export const createCliCreateMessage = (
	agentLabel: string,
	context: AgentLaunchGuardContext,
	smart?: boolean
) => {
	return {
		type: 'cli.create' as const,
		agent: agentLabel,
		launchGuard: getAgentLaunchGuardMessage(agentLabel, context),
		smart
	};
};
