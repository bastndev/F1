/**
 * Phase 2 webview HTML: the terminal layout shown once an agent is chosen.
 * Panel markup ships as static files under dist/webview/{panel-tab,
 * panel-terminal}; this stitches them into the page with CSP, styles, and
 * the agent icon payload the terminal script reads.
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { cliAgents } from '../shared/agents';
import {
	getNonce,
	getWebviewAssetUriString,
	getWorkspaceDisplayPath,
	serializeJsonForHtmlScript
} from './webview-assets';

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
		'dist',
		'webview',
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

export const getAgentWebviewHtml = (
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	selectedAgent: string
) => {
	const nonce = getNonce();
	const styleUris = [
		getWebviewAssetUriString(webview, extensionUri, 'global.css'),
		getWebviewAssetUriString(webview, extensionUri, 'vendor', 'xterm', 'xterm.css'),
		getWebviewAssetUriString(webview, extensionUri, 'styles', 'layout.css'),
		getWebviewAssetUriString(webview, extensionUri, 'panel-tab', 'tab.css'),
		getWebviewAssetUriString(webview, extensionUri, 'panel-terminal', 'terminal.css'),
		getWebviewAssetUriString(webview, extensionUri, 'styles', 'skeleton', 'start-cli.css')
	];
	const scriptUri = getWebviewAssetUriString(webview, extensionUri, 'terminal.js');
	const agentIcons = cliAgents.map((agent) => ({
		label: agent.label,
		icon: getWebviewAssetUriString(webview, extensionUri, 'assets', 'icons-cli', agent.iconFile),
		darkIcon: agent.darkIcon === true,
		lightIcon: agent.lightIcon === true
	}));

	return getCliHubWebviewHtml({
		extensionUri,
		cspSource: webview.cspSource,
		nonce,
		styleUris,
		scriptUri,
		selectedAgent,
		workspacePath: getWorkspaceDisplayPath(),
		agentIcons: serializeJsonForHtmlScript(agentIcons)
	});
};

function getCliHubWebviewHtml(options: CliHubWebviewOptions) {
	const styleLinks = options.styleUris
		.map((styleUri) => `<link href="${escapeHtml(styleUri)}" rel="stylesheet">`)
		.join('\n\t');

	const panelHtml = panels
		.map((panel) => replacePlaceholders(readPanelHtml(options.extensionUri, panel), options))
		.filter(Boolean)
		.join('\n\n');

	// CSP notes:
	// - style-src 'unsafe-inline' is required: the tool modals inject <style>
	//   elements at mount time (ensureStyles) and xterm.js styles dynamically.
	// - connect-src lists exactly the translation providers the webview-side
	//   translator calls (browser-terminal-translator.ts); keep them in sync.
	return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} data:; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}'; connect-src ${options.cspSource} https://api.mymemory.translated.net https://lingva.thedaviddelta.com https://libretranslate.de;">
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
