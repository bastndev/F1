/**
 * Phase 1 webview HTML: the launcher (fuzzy-search agent picker). The static
 * template ships at dist/my-cli/webview/launcher/index.html; this fills in URIs,
 * CSP, and the agent models (with installed-state) it renders.
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { cliAgents } from '../shared/agents';
import { isCliInstalled } from './terminal-cli/installation';
import {
	getNonce,
	getWebviewAssetUri,
	getWebviewAssetUriString,
	getWorkspaceDisplayPath,
	serializeJsonForHtmlScript
} from './webview-assets';

export const getLauncherWebviewHtml = async (
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	launcherStateSessionId: string
) => {
	const htmlPath = getWebviewAssetUri(extensionUri, 'launcher', 'index.html');
	const stylePath = getWebviewAssetUri(extensionUri, 'global.css');

	const styleUri = webview.asWebviewUri(stylePath);
	const scriptUri = getWebviewAssetUriString(webview, extensionUri, 'launcher', 'index.js');
	const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'assets', 'logo.svg')).toString();
	const nonce = getNonce();
	const contentSecurityPolicy = [
		"default-src 'none'",
		`img-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource}`,
		`script-src 'nonce-${nonce}'`
	].join('; ');

	const installedByLabel = new Map(
		await Promise.all(
			cliAgents.map(async (agent) => [agent.label, await isCliInstalled(agent)] as const)
		)
	);
	const launcherModels = cliAgents.map((agent) => ({
		label: agent.label,
		aliases: agent.aliases,
		icon: getWebviewAssetUriString(webview, extensionUri, 'assets', 'icons-cli', agent.iconFile),
		darkIcon: agent.darkIcon === true,
		lightIcon: agent.lightIcon === true,
		installed: installedByLabel.get(agent.label) === true
	}));

	let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
	html = html.replace('${styleUri}', styleUri.toString());
	html = html.replace('${scriptUri}', scriptUri);
	html = html.replace('${logoUri}', logoUri);
	html = html.replace('${contentSecurityPolicy}', contentSecurityPolicy);
	html = html.replace(/\$\{nonce\}/g, nonce);
	html = html.replace('${cliModels}', serializeJsonForHtmlScript(launcherModels));
	html = html.replace('${launcherStateSessionId}', serializeJsonForHtmlScript(launcherStateSessionId));
	html = html.replace('${workspacePath}', getWorkspaceDisplayPath());

	return html;
};
