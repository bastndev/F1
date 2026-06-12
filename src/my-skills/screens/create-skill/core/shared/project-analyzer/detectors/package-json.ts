import * as vscode from 'vscode';

export async function readWorkspacePackageJson(workspaceUri: vscode.Uri): Promise<Record<string, unknown> | null> {
	try {
		const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(workspaceUri, 'package.json'));
		return JSON.parse(new TextDecoder().decode(content)) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function getPackageNames(packageJson: Record<string, unknown> | null): Set<string> {
	if (!packageJson) {
		return new Set();
	}

	return new Set([
		...Object.keys(getRecord(packageJson.dependencies)),
		...Object.keys(getRecord(packageJson.devDependencies)),
		...Object.keys(getRecord(packageJson.peerDependencies)),
		...Object.keys(getRecord(packageJson.optionalDependencies)),
	]);
}

function getRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}
