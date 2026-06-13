import * as vscode from 'vscode';
import type { AgentsClaudeWorkspaceContext, DetectedFramework, EsbuildEntryPoint, ExistingInstructionInfo, PackageJsonInfo, PackageManagerInfo, ProjectCaveat, ProjectType, SourceEntryPoint, StaticSiteInfo, TypeScriptInfo, UnusedFile, VscodeWorkspaceInfo, WorkspaceFilesInfo, WorkspacePathInfo, WorkspaceScript } from './types';

const knownFrameworks: Array<{
	id: string;
	name: string;
	packages: string[];
	configFiles: string[];
}> = [
	{ id: 'vite', name: 'Vite', packages: ['vite'], configFiles: ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts'] },
	{ id: 'react', name: 'React', packages: ['react', 'react-dom'], configFiles: [] },
	{ id: 'nextjs', name: 'Next.js', packages: ['next'], configFiles: ['next.config.js', 'next.config.mjs', 'next.config.ts'] },
	{ id: 'typescript', name: 'TypeScript', packages: ['typescript'], configFiles: ['tsconfig.json'] },
	{ id: 'tailwind', name: 'Tailwind CSS', packages: ['tailwindcss', '@tailwindcss/vite'], configFiles: ['tailwind.config.js', 'tailwind.config.ts'] },
	{ id: 'vue', name: 'Vue', packages: ['vue'], configFiles: ['vue.config.js'] },
	{ id: 'svelte', name: 'Svelte', packages: ['svelte'], configFiles: ['svelte.config.js'] },
	{ id: 'astro', name: 'Astro', packages: ['astro'], configFiles: ['astro.config.mjs', 'astro.config.js'] },
	{ id: 'esbuild', name: 'esbuild', packages: ['esbuild'], configFiles: ['esbuild.js', 'esbuild.mjs'] },
	{ id: 'eslint', name: 'ESLint', packages: ['eslint', 'typescript-eslint'], configFiles: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json'] },
	{ id: 'vitest', name: 'Vitest', packages: ['vitest'], configFiles: ['vitest.config.ts', 'vitest.config.js'] },
	{ id: 'playwright', name: 'Playwright', packages: ['playwright', '@playwright/test'], configFiles: ['playwright.config.ts', 'playwright.config.js'] },
	{ id: 'mocha', name: 'Mocha', packages: ['mocha', '@types/mocha', 'vscode-test', '@vscode/test-cli', '@vscode/test-electron'], configFiles: ['.mocharc.js', '.mocharc.json'] },
	{ id: 'prisma', name: 'Prisma', packages: ['prisma', '@prisma/client'], configFiles: ['prisma/schema.prisma'] },
	{ id: 'express', name: 'Express', packages: ['express'], configFiles: [] },
	{ id: 'fastify', name: 'Fastify', packages: ['fastify'], configFiles: [] },
	{ id: 'prettier', name: 'Prettier', packages: ['prettier'], configFiles: ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'] },
];

const knownSourceEntryPointCandidates: Array<{ path: string; description: string; patternHints?: string[] }> = [
	{ path: 'src/main.ts', description: 'main application entry point', patternHints: ['IIFE', 'module', 'import'] },
	{ path: 'src/main.js', description: 'main application entry point' },
	{ path: 'src/index.ts', description: 'library entry point', patternHints: ['export'] },
	{ path: 'src/index.js', description: 'library entry point' },
	{ path: 'src/app.ts', description: 'web application bootstrap' },
	{ path: 'src/app.js', description: 'web application bootstrap' },
	{ path: 'src/App.tsx', description: 'React application root component' },
	{ path: 'src/App.vue', description: 'Vue application root component' },
	{ path: 'src/extension.ts', description: 'VS Code extension activation entrypoint' },
	{ path: 'index.html', description: 'HTML entry point (loads scripts/styles)', patternHints: ['vite', 'module', 'script'] },
];

const packageManagerLockfiles: Array<{ name: string; lockfile: string }> = [
	{ name: 'bun', lockfile: 'bun.lock' },
	{ name: 'bun', lockfile: 'bun.lockb' },
	{ name: 'pnpm', lockfile: 'pnpm-lock.yaml' },
	{ name: 'yarn', lockfile: 'yarn.lock' },
	{ name: 'npm', lockfile: 'package-lock.json' },
];

const instructionFiles = [
	'.cursor/rules',
	'.cursorrules',
	'.github/copilot-instructions.md',
] as const;

export async function inspectAgentsClaudeWorkspace(workspaceUri: vscode.Uri, workspaceName: string): Promise<AgentsClaudeWorkspaceContext> {
	const [packageJson, tsconfigJson] = await Promise.all([
		readJsonObject(workspaceUri, 'package.json'),
		readJsonObject(workspaceUri, 'tsconfig.json'),
	]);

	const [
		esbuildText,
		tasksJson,
		launchJson,
		files,
		existingInstructions,
		keyPaths,
		staticSiteInfo,
		detectedFrameworks,
		sourceEntryPoints,
		caveats,
		unusedFiles,
		hasViteConfig,
	] = await Promise.all([
		readWorkspaceText(workspaceUri, 'esbuild.js'),
		readJsonObjectWithComments(workspaceUri, '.vscode/tasks.json'),
		readJsonObjectWithComments(workspaceUri, '.vscode/launch.json'),
		inspectWorkspaceFiles(workspaceUri),
		inspectExistingInstructions(workspaceUri),
		inspectKeyPaths(workspaceUri),
		inspectStaticSite(workspaceUri),
		detectFrameworks(workspaceUri, packageJson),
		inspectSourceEntryPoints(workspaceUri),
		detectCaveats(workspaceUri, packageJson, tsconfigJson),
		detectUnusedFiles(workspaceUri),
		inspectHasViteConfig(workspaceUri),
	]);

	const packageJsonInfo = packageJson ? createPackageJsonInfo(packageJson) : undefined;
	const isStaticSite = !packageJson && staticSiteInfo?.isStaticSite;
	const projectType: ProjectType = packageJsonInfo?.isVsCodeExtension ? 'vscode-extension' : (packageJson ? 'node-package' : (isStaticSite ? 'static-site' : 'unknown'));

	const hasLinter = detectedFrameworks.some(fw => fw.id === 'eslint');
	const hasFormatter = detectedFrameworks.some(fw => fw.id === 'prettier');
	const hasTestRunner = detectedFrameworks.some(fw => fw.id === 'vitest' || fw.id === 'playwright' || fw.id === 'mocha');

	return {
		workspaceName,
		projectType,
		packageManager: await detectPackageManager(workspaceUri, packageJson),
		packageJson: packageJsonInfo,
		scripts: createWorkspaceScripts(packageJson),
		esbuildEntries: esbuildText ? parseEsbuildEntries(esbuildText) : [],
		typescript: tsconfigJson ? createTypeScriptInfo(tsconfigJson) : undefined,
		vscode: createVscodeWorkspaceInfo(tasksJson, launchJson),
		files,
		staticSiteInfo: isStaticSite ? staticSiteInfo : undefined,
		keyPaths,
		existingInstructions,
		detectedFrameworks,
		sourceEntryPoints,
		caveats,
		unusedFiles,
		hasLinter,
		hasFormatter,
		hasTestRunner,
		hasViteConfig,
	};
}

async function detectPackageManager(workspaceUri: vscode.Uri, packageJson: Record<string, unknown> | undefined): Promise<PackageManagerInfo> {
	for (const candidate of packageManagerLockfiles) {
		if (await pathExists(workspaceUri, candidate.lockfile)) {
			return {
				name: candidate.name,
				lockfile: candidate.lockfile,
				source: 'lockfile',
			};
		}
	}

	const packageManager = typeof packageJson?.packageManager === 'string'
		? packageJson.packageManager.split('@')[0]
		: undefined;

	if (packageManager) {
		return {
			name: packageManager,
			source: 'packageManager',
		};
	}

	return {
		name: 'npm',
		source: 'fallback',
	};
}

function createPackageJsonInfo(packageJson: Record<string, unknown>): PackageJsonInfo {
	const contributes = isRecord(packageJson.contributes) ? packageJson.contributes : undefined;
	const views = contributes && isRecord(contributes.views) ? contributes.views : undefined;
	const engines = isRecord(packageJson.engines) ? packageJson.engines : undefined;
	const main = typeof packageJson.main === 'string' ? packageJson.main : undefined;

	return {
		name: typeof packageJson.name === 'string' ? packageJson.name : undefined,
		displayName: typeof packageJson.displayName === 'string' ? packageJson.displayName : undefined,
		description: typeof packageJson.description === 'string' ? packageJson.description : undefined,
		version: typeof packageJson.version === 'string' ? packageJson.version : undefined,
		main,
		vscodeEngine: typeof engines?.vscode === 'string' ? engines.vscode : undefined,
		isVsCodeExtension: typeof engines?.vscode === 'string',
		hasViewsContribution: views !== undefined && Object.keys(views).length > 0,
	};
}

function createWorkspaceScripts(packageJson: Record<string, unknown> | undefined): WorkspaceScript[] {
	if (!packageJson || !isRecord(packageJson.scripts)) {
		return [];
	}

	const preferredOrder = [
		'check-types',
		'lint',
		'compile',
		'package',
		'watch',
		'test',
		'pretest',
		'compile-tests',
	];
	const scripts = Object.entries(packageJson.scripts)
		.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
		.map(([name, command]) => ({ name, command }));

	return scripts.sort((a, b) => {
		const aIndex = preferredOrder.indexOf(a.name);
		const bIndex = preferredOrder.indexOf(b.name);
		if (aIndex !== -1 || bIndex !== -1) {
			return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
		}

		return a.name.localeCompare(b.name);
	});
}

function parseEsbuildEntries(esbuildText: string): EsbuildEntryPoint[] {
	const entries: EsbuildEntryPoint[] = [];
	
	const entryPointMatches = esbuildText.matchAll(/entryPoints\s*:\s*\[\s*['"]([^'"]+)['"]\s*\]/g);
	for (const match of entryPointMatches) {
		const source = match[1];
		const blockStart = esbuildText.lastIndexOf('{', match.index);
		const startIndex = blockStart !== -1 ? blockStart : match.index;
		const endIndex = Math.min(esbuildText.length, match.index + 500);
		const block = esbuildText.substring(startIndex, endIndex);
		
		if (!entries.some(e => e.source === source)) {
			entries.push({
				source,
				output: extractStringProperty(block, 'outfile'),
				format: extractStringProperty(block, 'format'),
				platform: extractStringProperty(block, 'platform'),
			});
		}
	}

	return entries;
}

function createTypeScriptInfo(tsconfigJson: Record<string, unknown>): TypeScriptInfo {
	const compilerOptions = isRecord(tsconfigJson.compilerOptions) ? tsconfigJson.compilerOptions : {};

	return {
		module: typeof compilerOptions.module === 'string' ? compilerOptions.module : undefined,
		target: typeof compilerOptions.target === 'string' ? compilerOptions.target : undefined,
		strict: typeof compilerOptions.strict === 'boolean' ? compilerOptions.strict : undefined,
	};
}

function createVscodeWorkspaceInfo(tasksJson: Record<string, unknown> | undefined, launchJson: Record<string, unknown> | undefined): VscodeWorkspaceInfo | undefined {
	if (!tasksJson && !launchJson) {
		return undefined;
	}

	const tasks = Array.isArray(tasksJson?.tasks) ? tasksJson.tasks.filter(isRecord) : [];
	const defaultTask = tasks.find(task => {
		const group = isRecord(task.group) ? task.group : undefined;
		return group?.kind === 'build' && group?.isDefault === true;
	});
	const taskLabels = tasks
		.map(task => typeof task.label === 'string' ? task.label : undefined)
		.filter((label): label is string => Boolean(label));
	const launchConfigs = Array.isArray(launchJson?.configurations)
		? launchJson.configurations
			.filter(isRecord)
			.map(config => typeof config.name === 'string' ? config.name : undefined)
			.filter((name): name is string => Boolean(name))
		: [];

	return {
		defaultBuildTask: typeof defaultTask?.label === 'string' ? defaultTask.label : undefined,
		taskLabels,
		launchConfigs,
	};
}

async function inspectWorkspaceFiles(workspaceUri: vscode.Uri): Promise<WorkspaceFilesInfo> {
	const [hasReadme, hasGitignore, hasVscodeignore, hasSrcMySkills, hasRuntimeTemplates, hasTests, gitignoreText, vscodeignoreText] = await Promise.all([
		hasReadmeFile(workspaceUri),
		pathExists(workspaceUri, '.gitignore'),
		pathExists(workspaceUri, '.vscodeignore'),
		pathExists(workspaceUri, 'src/my-skills'),
			hasAnyPath(workspaceUri, [
				'src/my-skills/view/index.html',
				'src/my-skills/screens/create-skill/ui/shared/shell/shell.html',
			]),
		hasAnyPath(workspaceUri, [
			'src/__test__',
			'test',
			'tests',
		]),
		readWorkspaceText(workspaceUri, '.gitignore'),
		readWorkspaceText(workspaceUri, '.vscodeignore'),
	]);

	const ignoredDocs: string[] = [];
	if (vscodeignoreText) {
		const docFiles = ['ARCHITECTURE.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md'];
		for (const doc of docFiles) {
			if (hasIgnoredPath(vscodeignoreText, doc)) {
				ignoredDocs.push(doc);
			}
		}
	}

	return {
		hasReadme,
		hasGitignore,
		hasVscodeignore,
		distIgnored: gitignoreText ? hasIgnoredPath(gitignoreText, 'dist') : false,
		hasSrcMySkills,
		hasRuntimeTemplates,
		hasTests,
		ignoredDocs,
	};
}

async function inspectExistingInstructions(workspaceUri: vscode.Uri): Promise<ExistingInstructionInfo> {
	const [hasAgents, hasClaude, hasDesign, additionalResults] = await Promise.all([
		pathExists(workspaceUri, 'AGENTS.md'),
		pathExists(workspaceUri, 'CLAUDE.md'),
		pathExists(workspaceUri, 'DESIGN.md'),
		Promise.all(instructionFiles.map(async fileName => (await pathExists(workspaceUri, fileName)) ? fileName : undefined)),
	]);
	const additional = additionalResults.filter((fileName): fileName is typeof instructionFiles[number] => fileName !== undefined);

	return {
		hasAgents,
		hasClaude,
		hasDesign,
		additional: [...additional],
	};
}

async function inspectKeyPaths(workspaceUri: vscode.Uri): Promise<WorkspacePathInfo[]> {
	const candidates: WorkspacePathInfo[] = [
		{ path: 'src/extension.ts', description: 'VS Code extension activation entrypoint' },
		{ path: 'src/my-skills/my-skills.ts', description: 'webview provider and host-side orchestration' },
		{ path: 'src/my-skills/view/index.ts', description: 'main webview shell client script' },
		{ path: 'src/my-skills/screens/create-skill/ui/index.ts', description: 'CREATE screen client bundle entrypoint' },
		{ path: 'src/my-skills/screens/install-skill/core', description: 'INSTALL marketplace and installation core' },
		{ path: 'src/my-skills/screens/local-skill/core', description: 'LOCAL installed-skill discovery and state' },
		{ path: 'esbuild.js', description: 'bundle configuration for extension and webview outputs' },
		{ path: '.vscodeignore', description: 'extension packaging include/exclude rules' },
	];
	const checks = await Promise.all(candidates.map(async candidate => (await pathExists(workspaceUri, candidate.path)) ? candidate : undefined));

	return checks.filter((candidate): candidate is WorkspacePathInfo => Boolean(candidate));
}

async function hasReadmeFile(workspaceUri: vscode.Uri): Promise<boolean> {
	return hasAnyPath(workspaceUri, ['README.md', 'README.txt', 'README', 'readme.md', 'Readme.md']);
}

async function inspectStaticSite(workspaceUri: vscode.Uri): Promise<StaticSiteInfo> {
	const htmlFiles: string[] = [];
	const cssFiles: string[] = [];
	const jsFiles: string[] = [];
	const mediaDirectoriesStr = new Set<string>();
	let language: string | undefined;

	try {
		const entries = await vscode.workspace.fs.readDirectory(workspaceUri);
		for (const [name, type] of entries) {
			if (type === vscode.FileType.File) {
				if (name.endsWith('.html')) {
					htmlFiles.push(name);
					if (name === 'index.html') {
						const content = await readWorkspaceText(workspaceUri, name);
						const langMatch = content?.match(/<html[^>]*lang=["']([^"']+)["']/i);
						if (langMatch) {
							language = langMatch[1];
						}
					}
				} else if (name.endsWith('.css')) {
					cssFiles.push(name);
				} else if (name.endsWith('.js')) {
					jsFiles.push(name);
				}
			} else if (type === vscode.FileType.Directory) {
				const isNodeModulesOrGit = name === 'node_modules' || name === '.git';
				if (!isNodeModulesOrGit) {
					try {
						const subEntries = await vscode.workspace.fs.readDirectory(joinWorkspacePath(workspaceUri, name));
						const isMediaOnly = subEntries.length > 0 && subEntries.every(([subName, subType]) => {
							if (subType !== vscode.FileType.File) {
								return false;
							}
							return /\.(png|jpe?g|gif|svg|webp|ico|mp3|wav|ogg|mp4|webm|avi)$/i.test(subName);
						});
						if (isMediaOnly) {
							mediaDirectoriesStr.add(`${name}/`);
						} else {
							for (const [subName, subType] of subEntries) {
								if (subType === vscode.FileType.File) {
									if (subName.endsWith('.html')) {
										htmlFiles.push(`${name}/${subName}`);
									} else if (subName.endsWith('.css')) {
										cssFiles.push(`${name}/${subName}`);
									} else if (subName.endsWith('.js')) {
										jsFiles.push(`${name}/${subName}`);
									}
								}
							}
						}
					} catch {}
				}
			}
		}
	} catch {}

	return {
		isStaticSite: htmlFiles.length > 0,
		htmlFiles,
		cssFiles,
		jsFiles,
		mediaDirectories: Array.from(mediaDirectoriesStr),
		language
	};
}

async function hasAnyPath(workspaceUri: vscode.Uri, paths: string[]): Promise<boolean> {
	const results = await Promise.all(paths.map(pathName => pathExists(workspaceUri, pathName)));
	return results.some(Boolean);
}

async function pathExists(workspaceUri: vscode.Uri, relativePath: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(joinWorkspacePath(workspaceUri, relativePath));
		return true;
	} catch {
		return false;
	}
}

async function readWorkspaceText(workspaceUri: vscode.Uri, relativePath: string): Promise<string | undefined> {
	try {
		const bytes = await vscode.workspace.fs.readFile(joinWorkspacePath(workspaceUri, relativePath));
		return new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
}

async function readJsonObject(workspaceUri: vscode.Uri, relativePath: string): Promise<Record<string, unknown> | undefined> {
	const text = await readWorkspaceText(workspaceUri, relativePath);
	if (!text) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

async function readJsonObjectWithComments(workspaceUri: vscode.Uri, relativePath: string): Promise<Record<string, unknown> | undefined> {
	const text = await readWorkspaceText(workspaceUri, relativePath);
	if (!text) {
		return undefined;
	}

	try {
		const parsed: unknown = JSON.parse(stripJsonComments(text));
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function joinWorkspacePath(workspaceUri: vscode.Uri, relativePath: string): vscode.Uri {
	return vscode.Uri.joinPath(workspaceUri, ...relativePath.split('/'));
}

function hasIgnoredPath(gitignoreText: string, pathName: string): boolean {
	const normalized = pathName.replace(/\/$/, '');
	return gitignoreText
		.split(/\r?\n/)
		.map(line => line.trim())
		.some(line => line === normalized || line === `${normalized}/`);
}

function stripJsonComments(text: string): string {
	let result = '';
	let i = 0;

	while (i < text.length) {
		if (text[i] === '"') {
			result += '"';
			i++;
			while (i < text.length && text[i] !== '"') {
				if (text[i] === '\\') {
					result += text[i++];
				}
				if (i < text.length) {
					result += text[i++];
				}
			}
			if (i < text.length) {
				result += '"';
				i++;
			}
			continue;
		}

		if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') {
				i++;
			}
			continue;
		}

		if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && i + 1 < text.length && text[i + 1] === '/')) {
				i++;
			}
			i += 2;
			continue;
		}

		result += text[i++];
	}

	return result;
}

function extractStringProperty(block: string, key: string): string | undefined {
	const match = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`).exec(block);
	return match?.[1];
}

function extractArrayStringProperty(block: string, key: string): string | undefined {
	const match = new RegExp(`${key}\\s*:\\s*\\[\\s*['"]([^'"]+)['"]`).exec(block);
	return match?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectDependencies(packageJson: Record<string, unknown>): string[] {
	const depKeys: Array<keyof Record<string, unknown>> = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
	const names: string[] = [];

	for (const key of depKeys) {
		const deps = isRecord(packageJson[key]) ? packageJson[key] : undefined;
		if (deps) {
			names.push(...Object.keys(deps));
		}
	}

	return names;
}

async function inspectHasViteConfig(workspaceUri: vscode.Uri): Promise<boolean> {
	return hasAnyPath(workspaceUri, ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.mts']);
}

async function detectFrameworks(workspaceUri: vscode.Uri, packageJson: Record<string, unknown> | undefined): Promise<DetectedFramework[]> {
	if (!packageJson) {
		return [];
	}

	const deps = collectDependencies(packageJson);
	const frameworks: DetectedFramework[] = [];

	for (const fw of knownFrameworks) {
		const hasDep = fw.packages.some(pkg => deps.includes(pkg));
		const hasConfig = fw.configFiles.length > 0 && await hasAnyPath(workspaceUri, fw.configFiles);

		if (hasDep && hasConfig) {
			frameworks.push({ id: fw.id, name: fw.name, source: 'both' });
		} else if (hasDep) {
			frameworks.push({ id: fw.id, name: fw.name, source: 'dependency' });
		} else if (hasConfig) {
			frameworks.push({ id: fw.id, name: fw.name, source: 'config' });
		}
	}

	return frameworks;
}

async function inspectSourceEntryPoints(workspaceUri: vscode.Uri): Promise<SourceEntryPoint[]> {
	const results: SourceEntryPoint[] = [];

	for (const candidate of knownSourceEntryPointCandidates) {
		if (!await pathExists(workspaceUri, candidate.path)) {
			continue;
		}

		const content = await readWorkspaceText(workspaceUri, candidate.path);
		const entryPoint: SourceEntryPoint = {
			path: candidate.path,
			description: candidate.description,
		};

		if (content) {
			entryPoint.lineCount = content.split(/\r?\n/).length;

			if (candidate.patternHints) {
				const keyPatterns: string[] = [];
				for (const hint of candidate.patternHints) {
					if (hint === 'IIFE' && /\bIIFE\b|\(function\s*\(|\(\(\)\s*=>\s*\{/i.test(content)) {
						keyPatterns.push('IIFE-based');
					}
					if (hint === 'module' && /type=["']module["']/.test(content)) {
						keyPatterns.push('ES module script');
					}
					if (hint === 'import' && /\bimport\b/.test(content)) {
						keyPatterns.push('uses ES imports');
					}
					if (hint === 'vite' && /vite|\.ts['"]/.test(content)) {
						keyPatterns.push('Vite-powered');
					}
					if (hint === 'script' && /<script/.test(content)) {
						keyPatterns.push('loads scripts');
					}
					if (hint === 'export' && /\bexport\b/.test(content)) {
						keyPatterns.push('exports API');
					}
				}
				if (keyPatterns.length > 0) {
					entryPoint.keyPatterns = keyPatterns;
				}
			}
		}

		results.push(entryPoint);
	}

	return results;
}

async function detectCaveats(workspaceUri: vscode.Uri, packageJson: Record<string, unknown> | undefined, tsconfigJson: Record<string, unknown> | undefined): Promise<ProjectCaveat[]> {
	const caveats: ProjectCaveat[] = [];

	if (tsconfigJson) {
		const compilerOptions = isRecord(tsconfigJson.compilerOptions) ? tsconfigJson.compilerOptions : {};
		if (compilerOptions.strict === false) {
			caveats.push({
				severity: 'warning',
				message: '`tsconfig.json` has `"strict": false` — don\'t assume strict type checking.',
			});
		}
	}

	const allScripts = packageJson && isRecord(packageJson.scripts) ? Object.keys(packageJson.scripts) : [];
	const hasLinterScript = allScripts.some(s => /lint/i.test(s));
	const hasTestScript = allScripts.some(s => /test/i.test(s));
	const hasFormatScript = allScripts.some(s => /format|prettier/i.test(s));

	const hasLinterDetected = await hasAnyPath(workspaceUri, ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json']);
	const hasTestDetected = await hasAnyPath(workspaceUri, ['src/__test__', 'test', 'tests', '**/*.test.ts', '**/*.spec.ts', 'vitest.config.ts', 'vitest.config.js', 'playwright.config.ts', 'jest.config.js']);
	const hasFormatterDetected = await hasAnyPath(workspaceUri, ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js']);

	if (!hasLinterScript && !hasLinterDetected && packageJson) {
		caveats.push({
			severity: 'info',
			message: 'No linter detected — no `lint` script, no ESLint config.',
		});
	}
	if (!hasTestScript && !hasTestDetected && packageJson) {
		caveats.push({
			severity: 'info',
			message: 'No test runner configured — no `test` script or test config found.',
		});
	}
	if (!hasFormatScript && !hasFormatterDetected && packageJson) {
		caveats.push({
			severity: 'info',
			message: 'No formatter detected — no Prettier config or format script.',
		});
	}

	const gitignoreText = await readWorkspaceText(workspaceUri, '.gitignore');
	if (gitignoreText) {
		const hasDistIgnored = hasIgnoredPath(gitignoreText, 'dist');
		if (!hasDistIgnored) {
			const distExists = await pathExists(workspaceUri, 'dist');
			if (distExists) {
				caveats.push({
					severity: 'info',
					message: 'The `dist/` directory is checked in — it may contain stale build output.',
				});
			}
		}
	}

	const nodeModulesIgnored = gitignoreText ? hasIgnoredPath(gitignoreText, 'node_modules') : false;
	if (!nodeModulesIgnored && gitignoreText !== undefined) {
		caveats.push({
			severity: 'warning',
			message: '`node_modules/` is not listed in `.gitignore`.',
		});
	}

	const esbuildText = await readWorkspaceText(workspaceUri, 'esbuild.js');
	if (esbuildText) {
		const entries = parseEsbuildEntries(esbuildText);
		if (entries.length === 0) {
			caveats.push({
				severity: 'warning',
				message: '`esbuild.js` exists but no entry points could be parsed. Check the build configuration.',
			});
		}
	}

	return caveats;
}

async function detectUnusedFiles(workspaceUri: vscode.Uri): Promise<UnusedFile[]> {
	const unused: UnusedFile[] = [];

	const rootCssFiles = await listWorkspaceFiles(workspaceUri, '', '.css');
	const rootJsFiles = await listWorkspaceFiles(workspaceUri, '', '.js');

	const indexHtmlContent = await readWorkspaceText(workspaceUri, 'index.html');

	if (indexHtmlContent && rootCssFiles.length > 0) {
		for (const cssFile of rootCssFiles) {
			if (!indexHtmlContent.includes(cssFile) && cssFile !== 'style.css' && cssFile !== 'index.css') {
				unused.push({
					path: cssFile,
					description: 'not referenced in `index.html`',
				});
			}
		}
	}

	if (indexHtmlContent && rootJsFiles.length > 0) {
		for (const jsFile of rootJsFiles) {
			if (!indexHtmlContent.includes(jsFile)) {
				unused.push({
					path: jsFile,
					description: 'not referenced in `index.html`',
				});
			}
		}
	}

	const readmeFiles = ['README copy.md', 'README copy 2.md', 'readme copy.md'];
	for (const file of readmeFiles) {
		if (await pathExists(workspaceUri, file)) {
			unused.push({
				path: file,
				description: 'duplicate of `README.md`',
			});
		}
	}

	return unused;
}

async function listWorkspaceFiles(workspaceUri: vscode.Uri, subPath: string, extension: string): Promise<string[]> {
	const readPath = subPath ? joinWorkspacePath(workspaceUri, subPath) : workspaceUri;

	try {
		const entries = await vscode.workspace.fs.readDirectory(readPath);
		return entries
			.filter(([name, type]) => type === vscode.FileType.File && name.endsWith(extension))
			.map(([name]) => subPath ? `${subPath}/${name}` : name);
	} catch {
		return [];
	}
}
