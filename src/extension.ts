import * as vscode from 'vscode';
import { CliHubViewProvider } from './clihub/host/main';

export function activate(context: vscode.ExtensionContext) {
	const cliHubProvider = new CliHubViewProvider(context.extensionUri, context);
	context.subscriptions.push(
		cliHubProvider,
		vscode.window.registerWebviewViewProvider(CliHubViewProvider.viewType, cliHubProvider)
	);
}

export function deactivate() {}
