export interface PromptTranslateRequest {
	text: string;
	from: string;
	to: string;
}

export interface PromptTranslateResult {
	text: string;
	provider?: string;
	fromCache?: boolean;
}

export interface PromptTranslateClient {
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
}

