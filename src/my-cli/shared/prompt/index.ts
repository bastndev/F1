export { processPrompt } from './prompt-processor';
export { translatePromptText } from './prompt-translate-client';
export type { PromptSendContext, ProcessPromptResult } from './prompt-processor';
export type { PromptTranslateClient, PromptTranslateRequest, PromptTranslateResult } from './prompt-translate-types';

// Image / attachment support for the prompt chat (paste screenshots + image paths)
export {
	imageMarkerPattern,
	collectImageMarkerIds,
	protectImageMarkers,
	restoreImageMarkers,
	substituteMarkersWithPaths,
	stripPromptTokens,
	protectMentions,
	restoreMentions,
	protectSkillTokens,
	restoreSkillTokens,
} from './attachments/markers';

// Workspace skills: one aggregate [Skills #N] token in the textarea, expanded
// on send into instructions with each SKILL.md route resolved for the active CLI.
export {
	skillsTokenPattern,
	skillsTokenPresencePattern,
	skillsTokenWithOptionalTrailingSpacePattern,
	buildSkillsToken,
	resolveSkillPath,
	expandSkillsToken,
} from './skills';
export type { WorkspaceSkill, SkillRoot } from './skills';
export type { ImageAttachment } from './attachments/types';
export { isImageAttachment } from './attachments/types';
export { buildPromptTextWithImages } from './attachments/prepare';

// Collapsed-paste support: large pasted blocks become atomic markers in the
// textarea and are expanded back to the original content on send.
export {
	pasteMarkerPattern,
	shouldCollapsePaste,
	buildPasteMarker,
	countLines,
	detectPasteKind,
	expandPasteMarkers,
	protectPasteMarkers,
	restorePasteMarkers,
} from './attachments/pastes';
export type { PasteAttachment, PasteKind } from './attachments/pastes';

// Live spell-marking: the misspelled-range contract shared between host and webview.
export type { SpellIssue } from './spellcheck-types';

// Source-language table: drives translation source, spell-check language and the
// strict-toggle visibility. Single source of truth, shared host ↔ webview.
export {
	PROMPT_LANGUAGES,
	PROMPT_LANG_GLOBE,
	isPromptLang,
	getPromptLanguage,
} from './languages';
export type { PromptLang, PromptLanguage } from './languages';

// File mention picker (@ in prompt textarea) — only the data contract lives in shared.
// The actual DOM implementation (mountFileMentionPicker + styles) lives in the webview
// layer under tools/modal-prompt/components/file-mention to keep shared free of presentation.
export type { FileMentionEntry, FileMentionRequest } from './file-mention';
