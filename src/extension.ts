import * as vscode from 'vscode';
import { MyCliViewProvider } from './my-cli/my-cli';
import { MySkillsViewProvider } from './my-skills/my-skills';

export function activate(context: vscode.ExtensionContext) {
	const myCliProvider = new MyCliViewProvider(context.extensionUri, context);
	const mySkillsProvider = new MySkillsViewProvider(context);

	context.subscriptions.push(
		myCliProvider,
		vscode.window.registerWebviewViewProvider(MyCliViewProvider.viewType, myCliProvider),
		vscode.commands.registerCommand('f1.myCli.openTutorial', () => myCliProvider.openTutorial()),
		vscode.commands.registerCommand('f1.myCli.smartFocus', () => myCliProvider.smartFocus()),
		mySkillsProvider,
		vscode.commands.registerCommand('f1.mySkills.openCreate', () => mySkillsProvider.openCreateView()),
		vscode.commands.registerCommand('f1.mySkills.goCreate', () => mySkillsProvider.switchTab('create-panel')),
		vscode.commands.registerCommand('f1.mySkills.goInstall', () => mySkillsProvider.switchTab('install-panel')),
		vscode.commands.registerCommand('f1.mySkills.goLocal', () => mySkillsProvider.switchTab('local-panel')),
		vscode.window.registerWebviewViewProvider(
			MySkillsViewProvider.viewType,
			mySkillsProvider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	console.log('🎉 [F1] My CLI / My Skills / My Memory — activated');
}

export function deactivate() {}
