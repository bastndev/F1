type CliHubWebviewOptions = {
	cspSource: string;
	styleUri: string;
	selectedAgent: string;
	workspacePath: string;
};

const escapeHtml = (value: string) => {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
};

export function getCliHubWebviewHtml(options: CliHubWebviewOptions) {
	const selectedAgent = escapeHtml(options.selectedAgent);
	const workspacePath = escapeHtml(options.workspacePath);

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CLI Hub</title>
	<link href="${options.styleUri}" rel="stylesheet">
	<style>
		/* Layout global */
		body {
			margin: 0;
			padding: 0;
			display: flex;
			align-items: stretch;
			justify-content: flex-start;
			height: 100vh;
			width: 100vw;
			overflow: hidden;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
		}

		/* Panels */
		.layout-left {
			flex: 0 0 225px; /* 5% larger than previous 220px */
			border-right: 1px solid var(--vscode-editorGroup-border, rgba(128, 128, 128, 0.2));
			position: relative;
		}

		.layout-middle {
			flex: 1;
			border-right: 1px solid var(--vscode-editorGroup-border, rgba(128, 128, 128, 0.2));
			overflow-y: auto;
			position: relative;
		}

		.layout-right {
			flex: 1;
			overflow-y: auto;
			position: relative;
		}

		/* Overrides for global.css to prevent unnecessary scroll */
		.webview-panel {
			height: 100%;
			padding: 20px;
			box-sizing: border-box;
		}
	</style>
</head>
<body>
	<div class="layout-left">
		<!-- Left Panel -->
	</div>

	<div class="layout-middle">
		<div class="webview-panel">
			<div class="webview-message">hello Webview</div>
			<div class="webview-agent">${selectedAgent}</div>
		</div>

		<div class="workspace-path">${workspacePath}</div>
	</div>

	<div class="layout-right">
		<!-- Right Panel -->
	</div>
</body>
</html>`;
}
