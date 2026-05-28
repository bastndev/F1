import * as vscode from 'vscode';
import { CliHubViewProvider } from './cli/index';

export function activate(context: vscode.ExtensionContext) {
	const cliHubProvider = new CliHubViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CliHubViewProvider.viewType, cliHubProvider)
	);
}

export function deactivate() {}
