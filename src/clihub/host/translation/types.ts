export type PromptTranslationProviderId = 'myMemory' | 'googleUnofficial';

export interface PromptTranslationRequest {
	text: string;
	from: string;
	to: string;
	signal?: AbortSignal;
}

export interface PromptTranslationResult {
	text: string;
	providerId: PromptTranslationProviderId;
	providerName: string;
	fromCache?: boolean;
}

