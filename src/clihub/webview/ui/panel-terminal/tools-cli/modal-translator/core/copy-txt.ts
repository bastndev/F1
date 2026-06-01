import type { ToolContext } from '../../tools';

export function extractTextToTranslate(context: ToolContext): string {
	if (!context.getTerminalSelection || !context.getTerminalLines || !context.getLastPrompt) {
		return '';
	}

	// 1. Manual selection override
	const selection = context.getTerminalSelection();
	if (selection) {
		return selection;
	}

	// 2. Automatic extraction
	const lines = context.getTerminalLines();
	const lastPrompt = context.getLastPrompt();

	const fullText = lines.join('\n');
	
	if (lastPrompt) {
		const index = fullText.lastIndexOf(lastPrompt);
		if (index !== -1) {
			return fullText.substring(index + lastPrompt.length).trim();
		}
	}

	// 3. Fallback: Return last 20 lines if no prompt found and no selection
	const fallbackStart = Math.max(0, lines.length - 20);
	return lines.slice(fallbackStart).join('\n').trim();
}
