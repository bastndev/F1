import * as vscode from 'vscode';

export function registerLynxKeymapPrompt(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('f1.lynxKeymap.prompt', async () => {
			if (vscode.extensions.getExtension('bastndev.lynx-keymap')) {
				return;
			}
			const choice = await vscode.window.showInformationMessage(
				'Get smarter keybindings for AI tools — Lynx Keymap adds optimized shortcuts for Claude, Cursor, Copilot and more.',
				'Install'
			);
			if (choice === 'Install') {
				await vscode.commands.executeCommand(
					'workbench.extensions.installExtension',
					'bastndev.lynx-keymap'
				);
			}
		})
	);
}
