/**
 * Inbound webview-message shapes for the My Skills panel plus the runtime type
 * guards that validate them. Webview messages cross a serialization boundary,
 * so the provider (core/main.ts) narrows every message through these guards
 * before trusting its fields.
 */
import { isAgentsClaudeInstructionFileName, type AgentsClaudeInstructionFileName } from '../screens/create-skill/core/agents-claude-md';
import type {
	FlameSkillDetailMessage,
	FlameSkillsRequestMessage,
	InstallSkillInstallMessage,
	InstallSkillsMoreRequestMessage,
	InstallSkillsRequestMessage,
	InstallSkillsSearchRequestMessage,
	OfficialSkillsRequestMessage,
	OfficialSourcesRequestMessage,
	Trending24hRequestMessage,
} from '../screens/install-skill/core/types';
import type {
	LocalSkillDeleteMessage,
	LocalSkillDeleteSavedMessage,
	LocalSkillEnableSavedMessage,
	LocalSkillOpenMessage,
	LocalSkillSaveMessage,
	LocalSkillSetEnabledMessage,
	LocalSkillsRequestMessage,
	LocalSkillsSavedRequestMessage,
} from '../screens/local-skill/core/types';

export interface CreateSkillSearchRequestMessage {
	type: 'createSkill.search.request';
	query: string;
	requestId: number;
	limit?: number;
}

export interface CreateSkillSearchPrefetchMessage {
	type: 'createSkill.search.prefetch';
}

export interface CreateSkillSearchTypingMessage {
	type: 'createSkill.search.typing';
	query: string;
}

export interface CreateSkillFastNameConfirmedMessage {
	type: 'createSkill.fast.nameConfirmed';
	name: string;
}

export interface CreateSkillFastTechsSelectedMessage {
	type: 'createSkill.fast.techsSelected';
	categories: string[];
}

export interface CreateSkillRootInstructionCreateMessage {
	type: 'createSkill.rootFile.create';
	fileName: AgentsClaudeInstructionFileName;
}

export interface CreateSkillDesignSelectionMessage {
	colorId?: string;
	typographyId?: string;
	styleId?: string;
	skipColor?: boolean;
	skipTypography?: boolean;
	skipStyle?: boolean;
}

export interface CreateSkillDesignCreateMessage {
	type: 'createSkill.design.create';
	selection: CreateSkillDesignSelectionMessage;
	overwrite?: boolean;
}

export interface CreateSkillChatCreateMessage {
	type: 'createSkill.chat.create';
	name: string;
	query: string;
	target: 'agents' | 'claude';
	template: 'base' | 'fast' | 'ai';
}

export function isWebviewMessage(value: unknown): value is { type: string } {
	return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

export function isLocalSkillsRequestMessage(value: unknown): value is LocalSkillsRequestMessage {
	return isWebviewMessage(value) && value.type === 'localSkills.request';
}

export function isLocalSkillSetEnabledMessage(value: unknown): value is LocalSkillSetEnabledMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.setEnabled') {
		return false;
	}

	const message = value as { id?: unknown; enabled?: unknown };
	return typeof message.id === 'string' && typeof message.enabled === 'boolean';
}

export function isLocalSkillDeleteMessage(value: unknown): value is LocalSkillDeleteMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.delete') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

export function isLocalSkillOpenMessage(value: unknown): value is LocalSkillOpenMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.open') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

export function isLocalSkillSaveMessage(value: unknown): value is LocalSkillSaveMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.save') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

export function isLocalSkillsSavedRequestMessage(value: unknown): value is LocalSkillsSavedRequestMessage {
	return isWebviewMessage(value) && value.type === 'localSkills.saved.request';
}

export function isLocalSkillEnableSavedMessage(value: unknown): value is LocalSkillEnableSavedMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.enableSaved') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

export function isLocalSkillDeleteSavedMessage(value: unknown): value is LocalSkillDeleteSavedMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.deleteSaved') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

export function isInstallSkillsRequestMessage(value: unknown): value is InstallSkillsRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'installSkills.request') {
		return false;
	}

	const message = value as { refresh?: unknown };
	return message.refresh === undefined || typeof message.refresh === 'boolean';
}

export function isInstallSkillsMoreRequestMessage(value: unknown): value is InstallSkillsMoreRequestMessage {
	return isWebviewMessage(value) && value.type === 'installSkills.more.request';
}

export function isInstallSkillsSearchRequestMessage(value: unknown): value is InstallSkillsSearchRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'installSkills.search.request') {
		return false;
	}

	const message = value as { query?: unknown; requestId?: unknown; limit?: unknown };
	return typeof message.query === 'string'
		&& typeof message.requestId === 'number'
		&& (message.limit === undefined || typeof message.limit === 'number');
}

export function isCreateSkillSearchRequestMessage(value: unknown): value is CreateSkillSearchRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.search.request') {
		return false;
	}

	const message = value as { query?: unknown; requestId?: unknown; limit?: unknown };
	return typeof message.query === 'string'
		&& typeof message.requestId === 'number'
		&& (message.limit === undefined || typeof message.limit === 'number');
}

export function isCreateSkillSearchPrefetchMessage(value: unknown): value is CreateSkillSearchPrefetchMessage {
	return isWebviewMessage(value) && value.type === 'createSkill.search.prefetch';
}

export function isCreateSkillSearchTypingMessage(value: unknown): value is CreateSkillSearchTypingMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.search.typing') {
		return false;
	}

	const message = value as { query?: unknown };
	return typeof message.query === 'string';
}

export function isCreateSkillFastNameConfirmedMessage(value: unknown): value is CreateSkillFastNameConfirmedMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.fast.nameConfirmed') {
		return false;
	}

	const message = value as { name?: unknown };
	return typeof message.name === 'string';
}

export function isCreateSkillFastTechsSelectedMessage(value: unknown): value is CreateSkillFastTechsSelectedMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.fast.techsSelected') {
		return false;
	}

	const message = value as { categories?: unknown };
	return Array.isArray(message.categories) && message.categories.every(cat => typeof cat === 'string');
}

export function isCreateSkillRootInstructionCreateMessage(value: unknown): value is CreateSkillRootInstructionCreateMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.rootFile.create') {
		return false;
	}

	const message = value as { fileName?: unknown };
	return isAgentsClaudeInstructionFileName(message.fileName);
}

export function isCreateSkillDesignCreateMessage(value: unknown): value is CreateSkillDesignCreateMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.design.create') {
		return false;
	}

	const message = value as { selection?: unknown; overwrite?: unknown };
	if (!message.selection || typeof message.selection !== 'object') {
		return false;
	}

	const selection = message.selection as { colorId?: unknown; typographyId?: unknown; styleId?: unknown; skipColor?: unknown; skipTypography?: unknown; skipStyle?: unknown };
	return (selection.colorId === undefined || typeof selection.colorId === 'string')
		&& (selection.typographyId === undefined || typeof selection.typographyId === 'string')
		&& (selection.styleId === undefined || typeof selection.styleId === 'string')
		&& (selection.skipColor === undefined || typeof selection.skipColor === 'boolean')
		&& (selection.skipTypography === undefined || typeof selection.skipTypography === 'boolean')
		&& (selection.skipStyle === undefined || typeof selection.skipStyle === 'boolean')
		&& (message.overwrite === undefined || typeof message.overwrite === 'boolean');
}

export function isTrending24hRequestMessage(value: unknown): value is Trending24hRequestMessage {
	return isWebviewMessage(value) && value.type === 'trending24h.request';
}

export function isFlameSkillsRequestMessage(value: unknown): value is FlameSkillsRequestMessage {
	return isWebviewMessage(value) && value.type === 'flameSkills.request';
}

export function isFlameSkillOpenRepoMessage(value: unknown): value is { type: 'flameSkill.openRepo' } {
	return isWebviewMessage(value) && value.type === 'flameSkill.openRepo';
}

export function isFlameSkillDetailMessage(value: unknown): value is FlameSkillDetailMessage {
	if (!isWebviewMessage(value) || value.type !== 'flameSkill.viewDetail') {
		return false;
	}

	const message = value as { id?: unknown; skillId?: unknown; name?: unknown; source?: unknown };
	return typeof message.id === 'string'
		&& typeof message.skillId === 'string'
		&& typeof message.name === 'string'
		&& typeof message.source === 'string';
}

export function isOfficialSourcesRequestMessage(value: unknown): value is OfficialSourcesRequestMessage {
	return isWebviewMessage(value) && value.type === 'officialSources.request';
}

export function isOfficialSkillsRequestMessage(value: unknown): value is OfficialSkillsRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'officialSkills.request') {
		return false;
	}

	const message = value as { owner?: unknown };
	return typeof message.owner === 'string';
}

export function isInstallSkillInstallMessage(value: unknown): value is InstallSkillInstallMessage {
	if (!isWebviewMessage(value) || value.type !== 'installSkill.install') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

export function isCreateSkillChatCreateMessage(value: unknown): value is CreateSkillChatCreateMessage {
	return isWebviewMessage(value)
		&& value.type === 'createSkill.chat.create'
		&& typeof (value as any).name === 'string'
		&& typeof (value as any).query === 'string'
		&& ((value as any).target === 'agents' || (value as any).target === 'claude')
		&& ((value as any).template === 'base' || (value as any).template === 'fast' || (value as any).template === 'ai');
}
