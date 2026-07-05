// kiro's @ is a modal file-picker, not a text field: it auto-drills @folder/ into a
// child file (@src/ -> @file:src/style.css) and swallows anything pasted after the open
// picker. So kiro folder routes are sent as literal paths (@ dropped) — no picker opens,
// trailing text survives, one Enter submits. File routes keep @; kiro's @file: picker
// resolves those correctly. Kiro-only quirks stay isolated in this file.

const KIRO_SLUG = 'kiro';

// @-route whose path ends in '/', bounded by whitespace/edges → a folder mention. File
// mentions end in a name, so they don't match and keep their @.
const folderRoutePattern = /(?<=^|\s)@(\S+\/)(?=\s|$)/g;

/** kiro only: strip the @ from folder routes so they land as literal paths. Other agents
 *  and kiro file routes are returned unchanged. */
export const adaptRouteMentionsForKiro = (text: string, agentSlug: string): string => {
	if (agentSlug !== KIRO_SLUG) {
		return text;
	}
	return text.replace(folderRoutePattern, '$1');
};
