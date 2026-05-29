import * as vscode from 'vscode';
import { CliHubViewProvider } from './clihub/main';

export function activate(context: vscode.ExtensionContext) {
	const cliHubProvider = new CliHubViewProvider(context.extensionUri);
	context.subscriptions.push(
		cliHubProvider,
		vscode.window.registerWebviewViewProvider(CliHubViewProvider.viewType, cliHubProvider)
	);
}

export function deactivate() {}
