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
} from './attachments/markers';
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

// File mention picker (@ in prompt textarea) — only the data contract lives in core.
// The actual DOM implementation (mountFileMentionPicker + styles) lives in the UI layer
// under tools-cli-ui/modal-prompt/components/file-mention to keep core free of presentation.
export type { FileMentionEntry, FileMentionRequest } from './file-mention';
