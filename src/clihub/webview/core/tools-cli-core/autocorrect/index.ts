import { runFullAutocorrect } from './autocorrect-service';
import { warmTypoInstance } from './typo-service';

export async function applyAutocorrect(text: string): Promise<string> {
	const result = await runFullAutocorrect(text);
	return result.correctedText;
}

export { runFullAutocorrect } from './autocorrect-service';
export { warmTypoInstance };
