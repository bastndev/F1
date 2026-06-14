import type {
	ImageAttachment,
	PromptTranslateRequest,
	PromptTranslateResult,
	FileMentionEntry,
	SpellIssue,
	WorkspaceSkill
} from '../../../shared/prompt';

/** Capabilities the terminal layer injects into the prompt modal. */
export type PromptContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	getActiveModelName?: () => string | undefined;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<WorkspaceSkill[]>;
	openCreateSkill?: () => void;
	requestSpellcheck?: (text: string, strict: boolean) => Promise<SpellIssue[]>;
};
