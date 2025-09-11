import * as vscode from 'vscode';

export async function showExtensionNotification(extensionName: string): Promise<void> {
    const cleanName = extensionName.replace(/\s*\(v[^)]+\)$/, '');
    
    // Find the extension by name
    const extension = vscode.extensions.all.find(ext => {
        const extDisplayName = ext.packageJSON.displayName || ext.packageJSON.name;
        return extDisplayName === cleanName;
    });

    if (!extension) {
        vscode.window.showErrorMessage(`Extension "${cleanName}" not found.`);
        return;
    }

    // Get repository URL from package.json
    const repository = extension.packageJSON.repository;
    let repoUrl: string | undefined;

    if (repository) {
        if (typeof repository === 'string') {
            repoUrl = repository;
        } else if (repository.url) {
            repoUrl = repository.url;
        }
    }

    // Clean up the URL if it exists
    if (repoUrl) {
        // Remove git+ prefix and .git suffix if present
        repoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
        
        const selectedOption = await vscode.window.showInformationMessage(
            `Extension: ${cleanName}`,
            '⭐️ GitHub'
        );

        if (selectedOption === '⭐️ GitHub') {
            vscode.env.openExternal(vscode.Uri.parse(repoUrl));
        }
    } else {
        vscode.window.showWarningMessage(`No GitHub repository found for "${cleanName}"`);
    }
}

export function handleExtensionClick(extensionName: string): void {
    showExtensionNotification(extensionName);
}