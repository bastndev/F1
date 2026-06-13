import * as vscode from 'vscode';
import { CliHubViewProvider } from './clihub/clihub';
import { MySkillsViewProvider } from './my-skills/my-skills';

export function activate(context: vscode.ExtensionContext) {
	const cliHubProvider = new CliHubViewProvider(context.extensionUri, context);
	const mySkillsProvider = new MySkillsViewProvider(context);

	context.subscriptions.push(
		cliHubProvider,
		vscode.window.registerWebviewViewProvider(CliHubViewProvider.viewType, cliHubProvider),
		mySkillsProvider,
		vscode.commands.registerCommand('f1.mySkills.openCreate', () => mySkillsProvider.openCreateView()),
		vscode.window.registerWebviewViewProvider(
			MySkillsViewProvider.viewType,
			mySkillsProvider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);
}

export function deactivate() {}
