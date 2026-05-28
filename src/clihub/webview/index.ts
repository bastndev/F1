import * as fs from 'fs';
import * as vscode from 'vscode';

type CliHubWebviewOptions = {
	extensionUri: vscode.Uri;
	cspSource: string;
	styleUri: string;
	selectedAgent: string;
	workspacePath: string;
};

type PanelFile = {
	dir: string;
	name: string;
};

const panels: PanelFile[] = [
	{ dir: 'panel-tab', name: 'tab' },
	{ dir: 'panel-translate', name: 'translate' },
	{ dir: 'panel-terminal', name: 'terminal' }
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
		'src',
		'clihub',
		'webview',
		'ui',
		panel.dir,
		`${panel.name}.${extension}`
	);

	return fs.readFileSync(fileUri.fsPath, 'utf8').trim();
};

const replacePlaceholders = (value: string, options: CliHubWebviewOptions) => {
	return value
		.replace(/\$\{selectedAgent\}/g, escapeHtml(options.selectedAgent))
		.replace(/\$\{workspacePath\}/g, escapeHtml(options.workspacePath));
};

export function getCliHubWebviewHtml(options: CliHubWebviewOptions) {
	const panelStyles = panels
		.map((panel) => readPanelFile(options.extensionUri, panel, 'css'))
		.filter(Boolean)
		.join('\n\n');

	const panelHtml = panels
		.map((panel) => replacePlaceholders(readPanelFile(options.extensionUri, panel, 'html'), options))
		.filter(Boolean)
		.join('\n\n');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CLI Hub</title>
	<link href="${options.styleUri}" rel="stylesheet">
	<style>
		body {
			margin: 0;
			padding: 0;
			display: flex;
			align-items: stretch;
			justify-content: flex-start;
			height: 100vh;
			width: 100vw;
			overflow: hidden;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
		}

		${panelStyles}
	</style>
</head>
<body>
	${panelHtml}
</body>
</html>`;
}
