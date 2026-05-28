type CliHubWebviewOptions = {
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
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CLI Hub</title>
	<link href="${options.styleUri}" rel="stylesheet">
</head>
<body>
	<div class="webview-panel">
		<div class="webview-message">hello Webview</div>
		<div class="webview-agent">${selectedAgent}</div>
	</div>

	<div class="workspace-path">${workspacePath}</div>
</body>
</html>`;
}
