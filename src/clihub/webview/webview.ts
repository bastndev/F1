import * as fs from 'fs';
import * as vscode from 'vscode';

type CliHubWebviewOptions = {
	extensionUri: vscode.Uri;
	cspSource: string;
	nonce: string;
	styleUris: string[];
	scriptUri: string;
	selectedAgent: string;
	workspacePath: string;
	agentIcons: string;
};

type PanelFile = {
	dir: string;
	name: string;
};

const panels: PanelFile[] = [
	{ dir: 'panel-tab', name: 'tab' },
	{ dir: 'panel-terminal', name: 'terminal' },
	{ dir: 'panel-tool', name: 'tool' }
];

const escapeHtml = (value: string) => {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
};

const readPanelFile = (extensionUri: vscode.Uri, panel: PanelFile, extension: 'html' | 'css') => {
	const fileUri = vscode.Uri.joinPath(
		extensionUri,
		'dist',
		'clihub',
		'webview',
		'ui',
		panel.dir,
		`${panel.name}.${extension}`
	);

	return fs.readFileSync(fileUri.fsPath, 'utf8').trim();
};

const readPanelHtml = (extensionUri: vscode.Uri, panel: PanelFile) => {
	try {
		return readPanelFile(extensionUri, panel, 'html');
	} catch {
		return `<section class="panel-load-error">Could not load ${escapeHtml(panel.name)} panel.</section>`;
	}
};

const replacePlaceholders = (value: string, options: CliHubWebviewOptions) => {
	return value
		.replace(/\$\{selectedAgent\}/g, escapeHtml(options.selectedAgent))
		.replace(/\$\{workspacePath\}/g, escapeHtml(options.workspacePath));
};

export function getCliHubWebviewHtml(options: CliHubWebviewOptions) {
	const styleLinks = options.styleUris
		.map((styleUri) => `<link href="${escapeHtml(styleUri)}" rel="stylesheet">`)
		.join('\n\t');

	const panelHtml = panels
		.map((panel) => replacePlaceholders(readPanelHtml(options.extensionUri, panel), options))
		.filter(Boolean)
		.join('\n\n');

	return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} data:; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>CLI Hub</title>
		${styleLinks}
	</head>
	<body>
		<div class="agent-shell">
			${panelHtml}
		</div>
		<script id="cli-agent-icons" type="application/json" nonce="${options.nonce}">
			${options.agentIcons}
		</script>
		<script nonce="${options.nonce}" src="${escapeHtml(options.scriptUri)}"></script>
	</body>
	</html>`;
}
