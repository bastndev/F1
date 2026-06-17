/**
 * Helpers shared by the launcher- and terminal-phase HTML builders: webview
 * asset URIs (everything ships under dist/my-cli/webview), CSP nonces, and safe JSON
 * embedding into inline <script> tags.
 */
import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';

export const getWebviewAssetUri = (extensionUri: vscode.Uri, ...paths: string[]) => {
	return vscode.Uri.joinPath(extensionUri, 'dist', 'my-cli', 'webview', ...paths);
};

export const getWebviewAssetUriString = (
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	...paths: string[]
) => {
	return webview.asWebviewUri(getWebviewAssetUri(extensionUri, ...paths)).toString();
};

export const getNonce = () => {
	return crypto.randomBytes(16).toString('base64');
};

export const serializeJsonForHtmlScript = (value: unknown) => {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
};

export const getWorkspaceDisplayPath = () => {
	const fullPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '~/workspace/project';
	const projectName = path.basename(fullPath);

	return `~/${projectName}`;
};
