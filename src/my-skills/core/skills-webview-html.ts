/**
 * Webview HTML assembly for the My Skills view and its create-skill support
 * panel. Extracted from core/main.ts so the provider stays a thin router: this
 * module owns nonce generation, HTML escaping, CSP, template stitching, and the
 * two page shells. Host-side (Node) only — reads templates with fs at render
 * time, mirroring src/my-cli/core/webview-html.ts.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';

export function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getWorkspaceName(): string {
	return vscode.workspace.name ?? vscode.workspace.workspaceFolders?.[0]?.name ?? 'Workspace';
}

	function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function renderMarkdown(md: string, skillFolder: string): string {
	const rawBase = `https://raw.githubusercontent.com/bastndev/skills/main/skills/${encodeURIComponent(skillFolder)}`;

	function inline(text: string): string {
		let result = escapeHtml(text);
		result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m: string, alt: string, url: string) => {
			const href = url.startsWith('http') ? url : `${rawBase}/${url}`;
			return `<img src="${escapeHtml(href)}" alt="${escapeHtml(alt)}" loading="lazy">`;
		});
		result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m: string, label: string, url: string) => {
			const href = url.startsWith('http') ? url : `${rawBase}/${url}`;
			return `<a href="${escapeHtml(href)}">${label}</a>`;
		});
		result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
		result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
		return result;
	}

	const lines = md.split('\n');
	const out: string[] = [];
	let inCode = false;
	let codeBuf: string[] = [];

	for (const raw of lines) {
		if (raw.startsWith('```')) {
			if (inCode) {
				out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
				codeBuf = [];
			}
			inCode = !inCode;
			continue;
		}

		if (inCode) {
			codeBuf.push(raw);
			continue;
		}

		const trimmed = raw.trim();

		if (!trimmed) {
			out.push('');
			continue;
		}

		if (/^#{1,4}\s/.test(trimmed)) {
			const level = trimmed.match(/^#{1,4}/)![0].length;
			const text = trimmed.slice(level + 1);
			out.push(`<h${level}>${escapeHtml(text)}</h${level}>`);
			continue;
		}

		if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
			out.push(`<li>${inline(trimmed.slice(2))}</li>`);
			continue;
		}

		if (/^\d+\.\s/.test(trimmed)) {
			out.push(`<li>${inline(trimmed.replace(/^\d+\.\s/, ''))}</li>`);
			continue;
		}

		if (trimmed.startsWith('> ')) {
			out.push(`<blockquote><p>${inline(trimmed.slice(2))}</p></blockquote>`);
			continue;
		}

		if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
			out.push('<hr>');
			continue;
		}

		out.push(inline(raw));
	}

	const html = out.join('\n');

	return html
		.replace(/\n{3,}/g, '\n\n')
		.split('\n\n')
		.map(block => {
			const b = block.trim();
			if (!b) {
				return '';
			}

			if (/^<\/?(h[1-4]|pre|li|blockquote|hr|ul|ol|table)/.test(b)) {
				return b;
			}

			if (/^<li/.test(b)) {
				return `<ul>${b}</ul>`;
			}

			return `<p>${b}</p>`;
		})
		.join('\n');
}

function getErrorHtml(message: string): string {
	return `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:var(--vscode-foreground,#ccc);background:var(--vscode-editor-background,#1e1e1e);"><p>${message}</p></body></html>`;
}

export function getSkillsWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
	const shellPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'view', 'index.html').fsPath;

	let html: string;
	try {
		html = fs.readFileSync(shellPath, 'utf8');
	} catch (err) {
		console.error(`[MySkills] Failed to read shell HTML: ${err}`);
		return getErrorHtml('Failed to load shell template');
	}

	try {
		const localPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'local-skill', 'ui', 'local.html').fsPath;
		const installPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'install.html').fsPath;
		const createPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'shell', 'shell.html').fsPath;
		const createDockPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'dock', 'chat-dock.html').fsPath;
		const createModePath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'create.html').fsPath;
		const designModePath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'design-md', 'design-md.html').fsPath;
		const searchModePath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-search', 'search.html').fsPath;
		const namePromptPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'modal', 'skill-modal.html').fsPath;

		// ── Install sub-panels ────────────────────────────────────────
		const alltimePath  = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'alltime-skill',  'alltime.html').fsPath;
		const trendingPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'trending.html').fsPath;
		const trending24hPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', '24h', '24h.html').fsPath;
		const trendingFlamePath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'flame', 'flame.html').fsPath;
		const officialPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'official-skill', 'official.html').fsPath;
		const searchPath   = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'search-sh', 'search-sh.html').fsPath;

		let localHtml      = fs.readFileSync(localPath, 'utf8');
		let   installHtml  = fs.readFileSync(installPath, 'utf8');
		let createHtml     = fs.readFileSync(createPath, 'utf8');
		const createDockHtml = fs.readFileSync(createDockPath, 'utf8');
		const createModeHtml = fs.readFileSync(createModePath, 'utf8');
		const designModeHtml = fs.readFileSync(designModePath, 'utf8');
		const searchModeHtml = fs.readFileSync(searchModePath, 'utf8');
		const namePromptHtml = fs.readFileSync(namePromptPath, 'utf8');

		const alltimeHtml  = fs.readFileSync(alltimePath,  'utf8');
		let trendingHtml = fs.readFileSync(trendingPath, 'utf8');
		const trending24hHtml = fs.readFileSync(trending24hPath, 'utf8');
		const trendingFlameHtml = fs.readFileSync(trendingFlamePath, 'utf8');
		let officialHtml = fs.readFileSync(officialPath, 'utf8');
		const searchHtml   = fs.readFileSync(searchPath, 'utf8');

		const officialListPath = vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'official-skill', 'list-skill', 'list.html').fsPath;
		const officialListHtml = fs.readFileSync(officialListPath, 'utf8');

		const officialImagesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'assets', 'images', 'official'));
		officialHtml = officialHtml.replace('{{OFFICIAL_IMAGES_URI}}', officialImagesUri.toString());
		officialHtml = officialHtml.replace('<!-- OFFICIAL_LIST_PANEL -->', officialListHtml);
		trendingHtml = trendingHtml.replace('<!-- TRENDING_24H_PANEL -->', trending24hHtml);
		trendingHtml = trendingHtml.replace('<!-- TRENDING_FLAME_PANEL -->', trendingFlameHtml);

		// Substitute sub-panel placeholders inside the install shell
		installHtml = installHtml.replace('<!-- ALLTIME_PANEL -->',  alltimeHtml);
		installHtml = installHtml.replace('<!-- TRENDING_PANEL -->', trendingHtml);
		installHtml = installHtml.replace('<!-- OFFICIAL_PANEL -->', officialHtml);
		installHtml = installHtml.replace('<!-- SEARCH_PANEL -->', searchHtml);
		localHtml = localHtml.replaceAll('{{LOCAL_WORKSPACE_NAME}}', escapeHtml(getWorkspaceName()));

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
		const createScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'create-skill.js'));
		const createLogoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'assets', 'svg', 'logo-animated.svg'));
		const globalUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'view', 'styles', 'global.css'));
		const localStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'local-skill', 'ui', 'local.css'));
		const installStyleUri  = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'install.css'));
		const trendingStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'trending.css'));
		const officialStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'official-skill', 'official.css'));
		const searchStyleUri   = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'search-sh', 'search-sh.css'));
		const refineStyleUri   = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'refine', 'refine.css'));
		const createStyleUri   = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'shell', 'shell.css'));
		const createDockStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'dock', 'chat-dock.css'));
		const createTransitionsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'transitions.css'));
		const createModeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'create.css'));
		const designModeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'design-md', 'design-md.css'));
		const searchModeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-search', 'search.css'));
		const namePromptStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'modal', 'skill-modal.css'));
		createHtml = createHtml.replace('<!-- CHAT_DOCK_PANEL -->', createDockHtml);
		createHtml = createHtml.replace('<!-- CREATE_MODE_PANEL -->', createModeHtml);
		createHtml = createHtml.replace('<!-- DESIGN_MODE_PANEL -->', designModeHtml);
		createHtml = createHtml.replace('<!-- SEARCH_MODE_PANEL -->', searchModeHtml);
		createHtml = createHtml.replace('<!-- NAME_PROMPT_PANEL -->', namePromptHtml);
		const createPanelHtml = createHtml.replace('{{CREATE_LOGO_URI}}', createLogoUri.toString());

		const csp = [
			`<meta http-equiv="Content-Security-Policy" content="`,
			`default-src 'none';`,
			`base-uri 'none';`,
			`form-action 'none';`,
			`object-src 'none';`,
			`style-src ${webview.cspSource};`,
			`script-src 'nonce-${nonce}';`,
			`img-src ${webview.cspSource};`,
			`font-src ${webview.cspSource};`,
			`">`,
		].join(' ');

		html = html.replace('<!-- CSP -->', csp);
		html = html.replace('<!-- STYLES -->', `<link href="${globalUri}" rel="stylesheet"><link href="${localStyleUri}" rel="stylesheet"><link href="${installStyleUri}" rel="stylesheet"><link href="${trendingStyleUri}" rel="stylesheet"><link href="${officialStyleUri}" rel="stylesheet"><link href="${searchStyleUri}" rel="stylesheet"><link href="${refineStyleUri}" rel="stylesheet"><link href="${createStyleUri}" rel="stylesheet"><link href="${createDockStyleUri}" rel="stylesheet"><link href="${createTransitionsStyleUri}" rel="stylesheet"><link href="${createModeStyleUri}" rel="stylesheet"><link href="${designModeStyleUri}" rel="stylesheet"><link href="${searchModeStyleUri}" rel="stylesheet"><link href="${namePromptStyleUri}" rel="stylesheet">`);
		html = html.replace('<!-- LOCAL_PANEL -->', localHtml);
		html = html.replace('<!-- INSTALL_PANEL -->', installHtml); // already has sub-panels injected above
		html = html.replace('<!-- CREATE_PANEL -->', createPanelHtml);
		html = html.replace('<!-- SCRIPTS -->', `<script nonce="${nonce}" src="${scriptUri}"></script><script nonce="${nonce}" src="${createScriptUri}"></script>`);

		return html;
	} catch (err) {
		console.error(`[MySkills] Failed to read screen template: ${err}`);
		return getErrorHtml('Failed to load panel templates');
	}
}

export function getSkillReadmeHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string, skillName: string, skillSource: string, templateHtml: string, renderedContent: string): string {
	const readmeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'flame', 'view-readme', 'readme.css'));
	const readmeScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'skill-readme.js'));
	const csp = [
		`default-src 'none';`,
		`base-uri 'none';`,
		`form-action 'none';`,
		`object-src 'none';`,
		`style-src ${webview.cspSource};`,
		`script-src 'nonce-${nonce}';`,
		`img-src ${webview.cspSource} https://raw.githubusercontent.com;`,
		`font-src ${webview.cspSource};`,
	].join(' ');

	return [
		'<!DOCTYPE html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="UTF-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		`<meta http-equiv="Content-Security-Policy" content="${csp}">`,
		`<title>${escapeHtml(skillName)} — Skill README</title>`,
		`<link href="${readmeStyleUri}" rel="stylesheet">`,
		'</head>',
		'<body>',
		templateHtml
			.replace('{{README_TITLE}}', escapeHtml(skillName))
			.replace('{{README_SOURCE}}', escapeHtml(skillSource))
			.replace('{{README_CONTENT}}', renderedContent),
		`<script nonce="${nonce}" src="${readmeScriptUri}"></script>`,
		'</body>',
		'</html>',
	].join('');
}

export function getCreateSkillSupportHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
	const supportPath = vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'tutorial', 't-skill', 'support.html').fsPath;

	let content: string;
	try {
		content = fs.readFileSync(supportPath, 'utf8');
	} catch (err) {
		console.error(`[MySkills] Failed to read create support template: ${err}`);
		return getErrorHtml('Failed to load create support');
	}

	const supportStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'tutorial', 't-skill', 'support.css'));
	const supportScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'create-skill-support.js'));
	const supportLogoUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'my-skills', 'assets', 'svg', 'logo-animated.svg'));
	const authorImageUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'assets', 'images', 'author.webp'));
	const p1ImageUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'assets', 'images', 'tutorials', 'p1.webp'));
	const p2ImageUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'assets', 'images', 'tutorials', 'p2.webp'));
	const p3ImageUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'shared', 'assets', 'images', 'tutorials', 'p3.webp'));
	const supportHtml = content
		.replace('{{CREATE_SUPPORT_LOGO_URI}}', supportLogoUri.toString())
		.replace('{{AUTHOR_IMAGE_URI}}', authorImageUri.toString())
		.replace('{{P1_IMAGE_URI}}', p1ImageUri.toString())
		.replace('{{P2_IMAGE_URI}}', p2ImageUri.toString())
		.replace('{{P3_IMAGE_URI}}', p3ImageUri.toString());
	const csp = [
		`default-src 'none';`,
		`base-uri 'none';`,
		`form-action 'none';`,
		`object-src 'none';`,
		`style-src ${webview.cspSource};`,
		`script-src 'nonce-${nonce}';`,
		`img-src ${webview.cspSource};`,
		`font-src ${webview.cspSource};`,
	].join(' ');

	return [
		'<!DOCTYPE html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="UTF-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		`<meta http-equiv="Content-Security-Policy" content="${csp}">`,
		'<title>My Skills: Support</title>',
		`<link href="${supportStyleUri}" rel="stylesheet">`,
		'</head>',
		'<body>',
		supportHtml,
		`<script nonce="${nonce}" src="${supportScriptUri}"></script>`,
		'</body>',
		'</html>',
	].join('');
}
