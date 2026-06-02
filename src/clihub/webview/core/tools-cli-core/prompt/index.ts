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
} from './attachments/markers';
export type { ImageAttachment } from './attachments/types';
export { isImageAttachment } from './attachments/types';
export { buildPromptTextWithImages } from './attachments/prepare';
