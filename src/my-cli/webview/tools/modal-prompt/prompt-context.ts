import type {
	ImageAttachment,
	PromptTranslateRequest,
	PromptTranslateResult,
	FileMentionEntry,
	SpellIssue,
	WorkspaceSkill
} from '../../../shared/prompt';
import type { VoiceProgress, VoiceState } from '../../../shared/voice/voice-types';

/** Capabilities the terminal layer injects into the prompt modal. */
export type PromptContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	getActiveModelName?: () => string | undefined;
	getActiveSessionBuffer?: () => string | undefined;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	/** Whether the active CLI is mid-task and would corrupt its input if a command were injected now. */
	isCliBusy?: () => boolean;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<WorkspaceSkill[]>;
	openCreateSkill?: () => void;
	requestSpellcheck?: (text: string, lang: string, strict: boolean) => Promise<SpellIssue[]>;
	/** Type a one-shot rules prompt into the active CLI and resolve once the agent
	 *  has read it (marker seen) or a host-side hard cap fires. false = no session. */
	injectRules?: (text: string, marker: string) => Promise<boolean>;
	registerSkillsRefresh?: (refresh: () => void) => void;
	// Control a host-side read-aloud that may still be playing when this modal
	// opens (switched here from the translator mid-read). No speakText: prompt
	// only pauses/resumes/stops an existing read, never starts one.
	pauseSpeech?: () => void;
	resumeSpeech?: () => void;
	stopSpeech?: () => void;
	queryVoiceState?: () => void;
	onVoiceState?: (listener: (state: VoiceState, message?: string, progress?: VoiceProgress) => void) => () => void;
	refocusCli?: () => void;
};
