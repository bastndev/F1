import { runFullAutocorrect } from './prompt-autocorrect-service';

export async function applyAutocorrect(text: string): Promise<string> {
	const result = await runFullAutocorrect(text);
	return result.correctedText;
}

export { runFullAutocorrect } from './prompt-autocorrect-service';

