import type { AgentsClaudeInstructionFileName, AgentsClaudeWorkspaceContext, DetectedFramework, EsbuildEntryPoint, SourceEntryPoint, WorkspaceScript } from './types';

const preferredVerificationScripts = ['check-types', 'lint', 'compile', 'package', 'test'];
const preferredWorkflowScripts = ['watch', 'pretest', 'compile-tests'];

const scriptDescriptions: Record<string, string> = {
	dev: 'start dev server',
	start: 'start dev server',
	build: 'build for production',
	typecheck: 'check types without emitting',
	'check-types': 'check types without emitting',
	lint: 'run linter',
	compile: 'compile/bundle (dev)',
	package: 'package for distribution',
	watch: 'watch and rebuild on changes',
	test: 'run tests',
	pretest: 'pre-test setup',
	'compile-tests': 'compile tests',
	preview: 'preview production build',
	format: 'format code',
	clean: 'clean build artifacts',
	deploy: 'deploy to host',
	prepare: 'prepare for publish',
	release: 'release/publish',
};

export function createAgentsClaudeMarkdown(fileName: AgentsClaudeInstructionFileName, context: AgentsClaudeWorkspaceContext): string {
	return fileName === 'AGENTS.md'
		? createAgentsMarkdown(context)
		: createClaudeMarkdown(context);
}

function createAgentsMarkdown(context: AgentsClaudeWorkspaceContext): string {
	const isStaticSite = context.projectType === 'static-site';

	const lines = [
		'# AGENTS.md',
		'',
		...createProjectTypeSection(context),
		isStaticSite ? [] : createPackageManagerSection(context),
		isStaticSite ? [] : createCommandSection(context),
		isStaticSite ? createDevelopmentSection() : [],
		isStaticSite ? createStaticFileStructureSection(context) : createArchitectureSection(context),
		createSourceEntryPointsSection(context),
		isStaticSite ? [] : createBuildEntrypointsSection(context),
		isStaticSite ? [] : createRuntimeAssetsSection(context),
		isStaticSite ? [] : createTestingAndLaunchSection(context),
		...createInstructionFilesSection(context),
		createConventionsSection(context),
		createCaveatsSection(context),
		createUnusedFilesSection(context),
		...createBoundariesSection(context),
	];

	return trimMarkdown(lines.flat());
}

function createClaudeMarkdown(context: AgentsClaudeWorkspaceContext): string {
	if (context.existingInstructions.hasAgents) {
		const lines = [
			'@AGENTS.md',
			'',
			'# Claude Code',
			'',
			'- Shared repository instructions live in `AGENTS.md`; keep this file limited to Claude-specific workflow notes.',
			'- For broad or uncertain changes, explore first and propose a plan before editing.',
			`- After code edits, run the closest verification command from \`AGENTS.md\`${getPreferredCompileCommand(context) ? `; the usual full gate is \`${getPreferredCompileCommand(context)}\`` : ''}.`,
			'- Keep future additions short. If a rule applies to all agents, move it to `AGENTS.md` instead.',
		];

		return trimMarkdown(lines);
	}

	const isStaticSite = context.projectType === 'static-site';

	const lines = [
		'# CLAUDE.md',
		'',
		'This file gives Claude Code the repo-specific context it should not have to rediscover.',
		'',
		...createProjectTypeSection(context),
		isStaticSite ? [] : createPackageManagerSection(context),
		isStaticSite ? [] : createCommandSection(context),
		isStaticSite ? createDevelopmentSection() : [],
		isStaticSite ? createStaticFileStructureSection(context) : createArchitectureSection(context),
		createSourceEntryPointsSection(context),
		isStaticSite ? [] : createBuildEntrypointsSection(context),
		isStaticSite ? [] : createRuntimeAssetsSection(context),
		isStaticSite ? [] : createTestingAndLaunchSection(context),
		createConventionsSection(context),
		createCaveatsSection(context),
		createUnusedFilesSection(context),
		...createBoundariesSection(context),
		'## Claude Code workflow',
		'',
		'- For broad or uncertain changes, explore first and propose a plan before editing.',
		'- Prefer focused verification commands while iterating, then run the full gate before finishing.',
		'- Keep this file concise; move shared agent instructions to `AGENTS.md` if that file is added later.',
	];

	return trimMarkdown(lines.flat());
}

function createPackageManagerSection(context: AgentsClaudeWorkspaceContext): string[] {
	const manager = context.packageManager;
	const lockfile = manager.lockfile ? ` The lockfile is \`${manager.lockfile}\`.` : '';
	const sourceNote = manager.source === 'fallback' ? ' Confirm this before installing dependencies.' : '';

	return [
		'## Package manager',
		'',
		`- Use \`${manager.name}\` for this workspace.${lockfile}${sourceNote}`,
		`- Run package scripts with \`${getRunCommand(context, '<script>')}\`.`,
		'',
	];
}

function createCommandSection(context: AgentsClaudeWorkspaceContext): string[] {
	const verification = preferredVerificationScripts
		.map(name => context.scripts.find(script => script.name === name))
		.filter((script): script is WorkspaceScript => Boolean(script));
	const workflow = preferredWorkflowScripts
		.map(name => context.scripts.find(script => script.name === name))
		.filter((script): script is WorkspaceScript => Boolean(script));

	const alreadyListed = new Set([...preferredVerificationScripts, ...preferredWorkflowScripts]);
	const other = context.scripts.filter(script => !alreadyListed.has(script.name));

	if (verification.length === 0 && workflow.length === 0 && other.length === 0) {
		return [];
	}

	const lines = [
		'## Commands',
		'',
		'```bash',
	];

	const allScripts = [...verification, ...workflow];
	const mainScripts = allScripts.filter(s => s.name !== 'pretest' && s.name !== 'compile-tests');
	const internalScripts = allScripts.filter(s => s.name === 'pretest' || s.name === 'compile-tests');

	for (const script of mainScripts) {
		const cmd = getRunCommand(context, script.name);
		const desc = scriptDescriptions[script.name] || script.command;
		lines.push(`${cmd.padEnd(20)} # ${desc}`);
	}

	if (internalScripts.length > 0) {
		lines.push('');
		lines.push('# internal');
		for (const script of internalScripts) {
			const cmd = getRunCommand(context, script.name);
			const desc = scriptDescriptions[script.name] || script.command;
			lines.push(`${cmd.padEnd(20)} # ${desc}`);
		}
	}

	lines.push('```');
	lines.push('');

	const compile = context.scripts.find(script => script.name === 'compile');
	const pkg = context.scripts.find(script => script.name === 'package');
	if (compile?.command.includes('check-types') && compile.command.includes('lint')) {
		lines.push('`compile` already runs typecheck and lint before bundling; use it as the normal pre-finish gate.');
		lines.push('');
	} else if (pkg?.command.includes('check-types') && pkg.command.includes('lint')) {
		lines.push('`package` already runs typecheck and lint before production bundling.');
		lines.push('');
	}

	const missingTools: string[] = [];
	if (!context.hasLinter) {
		missingTools.push('linter');
	}
	if (!context.hasFormatter) {
		missingTools.push('formatter');
	}
	if (!context.hasTestRunner) {
		missingTools.push('test runner');
	}
	if (missingTools.length > 0) {
		lines.push(`No ${missingTools.join(', ')} is configured.`);
		lines.push('');
	}

	return lines;
}

function formatScriptEntry(context: AgentsClaudeWorkspaceContext, script: WorkspaceScript): string {
	const desc = scriptDescriptions[script.name];
	if (desc) {
		return `- \`${getRunCommand(context, script.name)}\` — ${desc}.`;
	}
	return `- \`${getRunCommand(context, script.name)}\` — \`${script.command}\`.`;
}

function createArchitectureSection(context: AgentsClaudeWorkspaceContext): string[] {
	const lines = [
		'## Architecture',
		'',
	];

	if (context.packageJson?.isVsCodeExtension) {
		lines.push(`- VS Code extension${context.packageJson.vscodeEngine ? ` targeting \`${context.packageJson.vscodeEngine}\`` : ''}.`);
		if (context.packageJson.main) {
			lines.push(`- Extension host main: \`${context.packageJson.main}\`; build before launching because runtime output lives under \`dist/\`.`);
		}
		if (context.keyPaths.some(path => path.path === 'src/extension.ts')) {
			lines.push('- Source activation entrypoint: `src/extension.ts`.');
		}
		if (context.keyPaths.some(path => path.path === 'src/my-skills/my-skills.ts')) {
			lines.push('- `src/my-skills/my-skills.ts` owns the `WebviewViewProvider`, host-side message handling, template loading, and workspace file writes.');
		}
		if (context.keyPaths.some(path => path.path === 'src/my-skills/view/index.ts')) {
			lines.push('- `src/my-skills/view/index.ts` is the shell bridge between webview events and `vscode.postMessage`.');
		}
	} else if (context.packageJson) {
		const displayName = context.packageJson.displayName ?? context.packageJson.name ?? context.workspaceName;
		lines.push(`- Project: ${displayName}.`);

		if (context.hasViteConfig) {
			lines.push('- Uses Vite for dev server and bundling.');
		} else if (context.detectedFrameworks.some(fw => fw.id === 'vite')) {
			lines.push('- Uses Vite with default configuration (no custom `vite.config.*`).');
		}

		if (context.packageJson.main) {
			lines.push(`- Package main: \`${context.packageJson.main}\`.`);
		}
	}

	const keyPaths = context.keyPaths.filter(path => ![
		'src/extension.ts',
		'src/my-skills/my-skills.ts',
		'src/my-skills/view/index.ts',
		'esbuild.js',
		'.vscodeignore',
	].includes(path.path));

	if (keyPaths.length > 0) {
		lines.push('Key paths:');
		lines.push(...keyPaths.map(path => `- \`${path.path}\` — ${path.description}.`));
	}

	lines.push('');
	return lines.length > 3 ? lines : [];
}

function createSourceEntryPointLine(entry: SourceEntryPoint): string {
	const parts = [`\`${entry.path}\``];
	if (entry.lineCount) {
		parts.push(`(${entry.lineCount} lines)`);
	}
	if (entry.keyPatterns && entry.keyPatterns.length > 0) {
		parts.push(`— ${entry.keyPatterns.join(', ')}`);
	}

	return `- ${parts.join(' ')}.`;
}

function createSourceEntryPointsSection(context: AgentsClaudeWorkspaceContext): string[] {
	const buildSources = new Set(context.esbuildEntries.map(e => e.source));
	const entryPoints = context.sourceEntryPoints.filter(ep => 
		ep.lineCount !== undefined && 
		ep.lineCount > 0 &&
		!buildSources.has(ep.path)
	);

	if (entryPoints.length === 0) {
		return [];
	}

	const lines = [
		'## Source entry points',
		'',
		...entryPoints.map(createSourceEntryPointLine),
		'',
	];

	return lines;
}

function createBuildEntrypointsSection(context: AgentsClaudeWorkspaceContext): string[] {
	if (context.esbuildEntries.length === 0) {
		return [];
	}

	return [
		'## Build entrypoints',
		'',
		'The esbuild config creates separate bundles; keep host and browser targets separate.',
		'',
		'| Source | Output | Format | Platform |',
		'|---|---|---|---|',
		...context.esbuildEntries.map(createEsbuildEntryRow),
		'',
	];
}

function createRuntimeAssetsSection(context: AgentsClaudeWorkspaceContext): string[] {
	const lines = [
		'## Runtime assets and packaging',
		'',
	];

	if (context.files.distIgnored) {
		lines.push('- `dist/` is ignored, so build before launching, testing, or packaging.');
	}
	if (context.packageJson?.isVsCodeExtension) {
		lines.push('- `vscode` is provided by the extension host; keep it external in extension bundles.');
	}
	if (context.files.hasRuntimeTemplates) {
		lines.push('- HTML templates, CSS, and SVG assets under `src/my-skills/` are loaded at runtime by the extension host, not bundled into the webview JS.');
	}
	if (context.files.hasVscodeignore && context.files.hasRuntimeTemplates) {
		lines.push('- `.vscodeignore` excludes TypeScript sources but keeps `src/my-skills/**/*.html`, `**/*.css`, and `**/*.svg`; update packaging rules if new runtime asset types are added.');
	}
	if (context.typescript) {
		const tsNotes = [
			context.typescript.module ? `module \`${context.typescript.module}\`` : undefined,
			context.typescript.target ? `target \`${context.typescript.target}\`` : undefined,
			context.typescript.strict ? 'strict mode' : undefined,
		].filter(Boolean);
		if (tsNotes.length > 0) {
			lines.push(`- TypeScript uses ${tsNotes.join(', ')}.`);
		}
	}

	lines.push('');
	return lines.length > 3 ? lines : [];
}

function createTestingAndLaunchSection(context: AgentsClaudeWorkspaceContext): string[] {
	const lines = [
		'## Testing and launch',
		'',
	];
	const testScript = context.scripts.find(script => script.name === 'test');
	const pretestScript = context.scripts.find(script => script.name === 'pretest');

	if (testScript) {
		lines.push(`- Test with \`${getRunCommand(context, 'test')}\` (${testScript.command}).`);
	}
	if (pretestScript) {
		lines.push(`- ` + `pretest` + ` is \`${pretestScript.command}\`, so tests may rebuild and lint before running.`);
	}
	if (context.vscode?.defaultBuildTask) {
		lines.push(`- VS Code's default build task is \`${context.vscode.defaultBuildTask}\`; launch configs may start that task automatically.`);
	}
	if (context.vscode?.launchConfigs.length) {
		lines.push(`- Launch configs: ${context.vscode.launchConfigs.map(name => `\`${name}\``).join(', ')}.`);
	}
	if (context.files.hasTests && !testScript) {
		lines.push('- Tests are present, but no `test` package script was detected; inspect the test config before running broad suites.');
	}

	lines.push('');
	return lines.length > 3 ? lines : [];
}

function createInstructionFilesSection(context: AgentsClaudeWorkspaceContext): string[] {
	const references = [
		context.existingInstructions.hasClaude ? '`CLAUDE.md`' : undefined,
		context.existingInstructions.hasDesign ? '`DESIGN.md`' : undefined,
		...context.existingInstructions.additional.map(file => `\`${file}\``),
	].filter((value): value is string => Boolean(value));

	if (references.length === 0) {
		return [];
	}

	return [
		'## Related instruction files',
		'',
		`- Also check ${references.join(', ')} when the task touches matching tooling or design behavior.`,
		'',
	];
}

function createProjectTypeSection(context: AgentsClaudeWorkspaceContext): string[] {
	const lines: string[] = ['## Project', ''];

	const desc = context.packageJson?.description;
	const isMarketingDesc = desc && (desc.includes('•') || desc.includes('http') || desc.includes('Available now'));

	if (desc && !isMarketingDesc) {
		lines.push(`- ${desc}.`);
	} else {
		let projectTypeDescription = '';
		if (context.projectType === 'static-site') {
			projectTypeDescription = 'Static HTML/CSS website.';
		} else if (context.projectType === 'node-package') {
			projectTypeDescription = 'Node.js package.';
		} else if (context.projectType === 'vscode-extension') {
			if (context.packageJson?.name === 'myskills') {
				projectTypeDescription = 'VS Code extension that manages an AI agent skills marketplace, local skill installation, and skill creation.';
			} else {
				projectTypeDescription = 'VS Code extension.';
			}
		}

		if (projectTypeDescription) {
			lines.push(`- ${projectTypeDescription}`);
		}
	}

	const nonLanguageFrameworks = context.detectedFrameworks.filter(fw => fw.id !== 'typescript' && fw.id !== 'eslint' && fw.id !== 'prettier');
	if (nonLanguageFrameworks.length > 0) {
		const frameworkNames = nonLanguageFrameworks.map(fw => fw.name).join(', ');
		lines.push(`- Built with: ${frameworkNames}.`);
	}
	if (context.detectedFrameworks.some(fw => fw.id === 'typescript')) {
		const strictNote = context.typescript?.strict === false ? ' (strict mode disabled)' : '';
		lines.push(`- Language: TypeScript${strictNote}.`);
	}
	if (context.staticSiteInfo?.language) {
		lines.push(`- Site language: ${context.staticSiteInfo.language}.`);
	}

	if (lines.length === 2) {
		return [];
	}

	lines.push('');
	return lines;
}

function createStaticFileStructureSection(context: AgentsClaudeWorkspaceContext): string[] {
	if (!context.staticSiteInfo) {
		return [];
	}

	const { htmlFiles, cssFiles, jsFiles, mediaDirectories } = context.staticSiteInfo;
	const lines = [
		'## File structure',
		'',
	];

	if (htmlFiles.length > 0) {
		const htmlList = htmlFiles.map(f => `\`${f}\``).join(', ');
		lines.push(`- HTML files: ${htmlList}`);
	}
	if (cssFiles.length > 0) {
		const cssList = cssFiles.map(f => `\`${f}\``).join(', ');
		lines.push(`- CSS files: ${cssList}`);
	}
	if (jsFiles.length > 0) {
		const jsList = jsFiles.map(f => `\`${f}\``).join(', ');
		lines.push(`- Scripts: ${jsList}`);
	}
	if (mediaDirectories.length > 0) {
		const mediaList = mediaDirectories.map(d => `\`${d}\``).join(', ');
		lines.push(`- Static media assets: ${mediaList}`);
	}

	lines.push('');
	return lines.length > 3 ? lines : [];
}

function createDevelopmentSection(): string[] {
	return [
		'## Development',
		'',
		'- Open `index.html` with Live Server or press F5 to preview locally.',
		'- Edit HTML and CSS directly; no compilation step required.',
		'',
	];
}

function createConventionsSection(context: AgentsClaudeWorkspaceContext): string[] {
	const isStaticSite = context.projectType === 'static-site';
	const lines: string[] = [];

	if (context.typescript?.strict === false) {
		lines.push('- `tsconfig.json` has `"strict": false` — don\'t assume strict type checking.');
	}

	if (context.detectedFrameworks.some(fw => fw.id === 'vite') && !context.hasViteConfig) {
		lines.push('- No `vite.config.*` file — uses Vite defaults.');
	}

	if (context.detectedFrameworks.some(fw => fw.id === 'react')) {
		lines.push('- Components use JSX/TSX; prefer functional components.');
	}

	if (isStaticSite) {
		lines.push('- Navigation uses anchor links to `#section-id` within `index.html`.');
		lines.push('- Keep assets local; no external dependencies or CDN links unless strictly necessary.');
	}

	if (context.projectType === 'vscode-extension') {
		lines.push('- Error messages with prefix `[MySkills]`.');
		lines.push('- Nonce of 64 chars for webview security.');
		lines.push('- Minimum 1200ms loading on create operations (UX).');
		lines.push('- Use `vscode.Uri.joinPath()` for paths.');
	}

	if (lines.length === 0) {
		return [];
	}

	return [
		'## Key Conventions',
		'',
		...lines,
		'',
	];
}

function createCaveatsSection(context: AgentsClaudeWorkspaceContext): string[] {
	if (context.caveats.length === 0) {
		return [];
	}

	return [
		'## Caveats',
		'',
		...context.caveats.map(c => `- ${c.message}`),
		'',
	];
}

function createUnusedFilesSection(context: AgentsClaudeWorkspaceContext): string[] {
	if (context.unusedFiles.length === 0) {
		return [];
	}

	return [
		'## Unused or duplicate files',
		'',
		...context.unusedFiles.map(f => `- \`${f.path}\` — ${f.description}.`),
		'',
	];
}

function createBoundariesSection(context: AgentsClaudeWorkspaceContext): string[] {
	const isStaticSite = context.projectType === 'static-site';

	if (isStaticSite) {
		return [
			'## Boundaries',
			'',
			'- Do not add build tools or `package.json` unless explicitly requested.',
			'- Do not introduce JavaScript frameworks; the project is vanilla HTML/CSS.',
			'',
		];
	}

	const lines = [
		'## Boundaries',
		'',
		'- Prefer existing local patterns and helper APIs before adding new abstractions.',
		'- Keep generated, packaged, and runtime asset boundaries intact; do not move files across host/webview ownership without updating build and packaging config.',
	];

	if (context.projectType === 'vscode-extension') {
		lines.push('- Webview DOM code is vanilla TypeScript; do not introduce a framework unless the project explicitly adopts one.');
		lines.push('- After changing host/webview message contracts, verify both the webview bridge and the extension host handler.');
	}

	if (context.files.ignoredDocs && context.files.ignoredDocs.length > 0) {
		const docsList = context.files.ignoredDocs.map(d => `\`${d}\``).join(', ');
		lines.push(`- ${docsList} must not exist when packaging the extension.`);
	}

	lines.push('');
	return lines;
}

function getRunCommand(context: AgentsClaudeWorkspaceContext, scriptName: string): string {
	const pm = context.packageManager.name;
	if (pm === 'bun') {
		return `bun ${scriptName}`;
	}
	return `${pm} run ${scriptName}`;
}

function getPreferredCompileCommand(context: AgentsClaudeWorkspaceContext): string | undefined {
	if (context.scripts.some(script => script.name === 'compile')) {
		return getRunCommand(context, 'compile');
	}

	if (context.scripts.some(script => script.name === 'test')) {
		return getRunCommand(context, 'test');
	}

	return undefined;
}

function createEsbuildEntryRow(entry: EsbuildEntryPoint): string {
	return `| \`${entry.source}\` | ${formatTableCell(entry.output)} | ${formatTableCell(entry.format)} | ${formatTableCell(entry.platform)} |`;
}

function formatTableCell(value: string | undefined): string {
	return value ? `\`${value.replace(/\|/g, '\\|')}\`` : '-';
}

function trimMarkdown(lines: string[]): string {
	const compactLines = lines.reduce<string[]>((acc, line) => {
		if (line === '' && acc[acc.length - 1] === '') {
			return acc;
		}

		acc.push(line);
		return acc;
	}, []);

	while (compactLines[compactLines.length - 1] === '') {
		compactLines.pop();
	}

	return `${compactLines.join('\n')}\n`;
}
