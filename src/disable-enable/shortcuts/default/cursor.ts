import * as vscode from 'vscode';

let cppSuggestionsEnabled = true; // Estado inicial - asume que está habilitado

export function activate(context: vscode.ExtensionContext) {
    // Registrar el comando para alternar sugerencias
    let toggleCommand = vscode.commands.registerCommand('f1.toggleCppSuggestions', async () => {
        try {
            if (cppSuggestionsEnabled) {
                // Desactivar sugerencias
                await vscode.commands.executeCommand('editor.cpp.disableenabled');
                cppSuggestionsEnabled = false;
                vscode.window.showInformationMessage('❌ AI Suggestions disabled');
            } else {
                // Activar sugerencias
                await vscode.commands.executeCommand('editor.action.enableCppGlobally');
                cppSuggestionsEnabled = true;
                vscode.window.showInformationMessage('✅ AI Suggestions enabled');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error toggling suggestions: ${error}`);
        }
    });

    // Agregar el comando al contexto para que se dispose correctamente
    context.subscriptions.push(toggleCommand);

    // Opcional: Comando para verificar el estado actual
    let statusCommand = vscode.commands.registerCommand('f1.cppSuggestionsStatus', () => {
        const status = cppSuggestionsEnabled ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`AI Suggestions are currently ${status}`);
    });

    context.subscriptions.push(statusCommand);
}

export function deactivate() {
    // Cleanup si es necesario
}