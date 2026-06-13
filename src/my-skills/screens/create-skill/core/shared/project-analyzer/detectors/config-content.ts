import * as vscode from 'vscode';
import type { ConfigContentMatch } from '../types';

export async function findConfigContentMatches(
	workspaceUri: vscode.Uri,
	matches: readonly ConfigContentMatch[],
): Promise<Set<string>> {
	const found = new Set<string>();
	const contentCache = new Map<string, string | null>();

	for (const match of matches) {
		for (const fileName of match.files) {
			const content = await readConfigContent(workspaceUri, fileName, contentCache);
			if (content === null) {
				continue;
			}

			if (match.terms.some(term => content.includes(term))) {
				found.add(fileName);
			}
		}
	}

	return found;
}

async function readConfigContent(
	workspaceUri: vscode.Uri,
	fileName: string,
	cache: Map<string, string | null>,
): Promise<string | null> {
	if (cache.has(fileName)) {
		return cache.get(fileName) ?? null;
	}

	try {
		const uri = vscode.Uri.joinPath(workspaceUri, ...fileName.split('/'));
		const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
		cache.set(fileName, content);
		return content;
	} catch {
		cache.set(fileName, null);
		return null;
	}
}
