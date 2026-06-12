import * as vscode from 'vscode';

export async function workspaceFileExists(workspaceUri: vscode.Uri, relativePath: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceUri, ...relativePath.split('/')));
		return true;
	} catch {
		return false;
	}
}

export async function findExistingWorkspaceFiles(workspaceUri: vscode.Uri, relativePaths: readonly string[]): Promise<Set<string>> {
	const entries = await Promise.all(relativePaths.map(async relativePath => ({
		relativePath,
		exists: await workspaceFileExists(workspaceUri, relativePath),
	})));

	return new Set(entries.filter(entry => entry.exists).map(entry => entry.relativePath));
}
