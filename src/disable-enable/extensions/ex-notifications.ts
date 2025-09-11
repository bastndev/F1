import * as vscode from 'vscode';

export interface NotificationOptions {
    message: string;
    option1: string;
    option2: string;
}

export async function showExtensionNotification(extensionName: string): Promise<void> {
    const cleanName = extensionName.replace(/\s*\(v[^)]+\)$/, '');
    
    const options: NotificationOptions = {
        message: `Selected extension: ${cleanName}`,
        option1: 'Option 1',
        option2: 'Option 2'
    };

    const selectedOption = await vscode.window.showInformationMessage(
        options.message,
        options.option1,
        options.option2
    );

    if (selectedOption === options.option1) {
        vscode.window.showInformationMessage('You have selected Option 1');
    } else if (selectedOption === options.option2) {
        vscode.window.showInformationMessage('You have selected Option 2');
    }
    // If nothing is selected, do nothing
}

export function handleExtensionClick(extensionName: string): void {
    showExtensionNotification(extensionName);
}