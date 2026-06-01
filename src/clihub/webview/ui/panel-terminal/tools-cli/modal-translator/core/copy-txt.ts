import type { ToolContext } from '../../tools';

export function extractTextToTranslate(context: ToolContext): string {
	if (!context.getTerminalSelection) {
		return '';
	}

	return context.getTerminalSelection();
}
