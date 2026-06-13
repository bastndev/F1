export type AgentsClaudeInstructionFileName = 'AGENTS.md' | 'CLAUDE.md';
export type ProjectType = 'vscode-extension' | 'node-package' | 'static-site' | 'unknown';

export interface PackageManagerInfo {
	name: string;
	lockfile?: string;
	source: 'lockfile' | 'packageManager' | 'fallback';
}

export interface WorkspaceScript {
	name: string;
	command: string;
}

export interface PackageJsonInfo {
	name?: string;
	displayName?: string;
	description?: string;
	version?: string;
	main?: string;
	vscodeEngine?: string;
	isVsCodeExtension: boolean;
	hasViewsContribution: boolean;
}

export interface EsbuildEntryPoint {
	source: string;
	output?: string;
	format?: string;
	platform?: string;
}

export interface TypeScriptInfo {
	module?: string;
	target?: string;
	strict?: boolean;
}

export interface VscodeWorkspaceInfo {
	defaultBuildTask?: string;
	taskLabels: string[];
	launchConfigs: string[];
}

export interface WorkspaceFilesInfo {
	hasReadme: boolean;
	hasGitignore: boolean;
	hasVscodeignore: boolean;
	distIgnored: boolean;
	hasSrcMySkills: boolean;
	hasRuntimeTemplates: boolean;
	hasTests: boolean;
	ignoredDocs: string[];
}

export interface WorkspacePathInfo {
	path: string;
	description: string;
}

export interface ExistingInstructionInfo {
	hasAgents: boolean;
	hasClaude: boolean;
	hasDesign: boolean;
	additional: string[];
}

export interface StaticSiteInfo {
	isStaticSite: boolean;
	htmlFiles: string[];
	cssFiles: string[];
	jsFiles: string[];
	mediaDirectories: string[];
	language?: string;
}

export interface DetectedFramework {
	id: string;
	name: string;
	source: 'dependency' | 'config' | 'both';
}

export interface SourceEntryPoint {
	path: string;
	description: string;
	lineCount?: number;
	keyPatterns?: string[];
}

export interface ProjectCaveat {
	severity: 'warning' | 'info';
	message: string;
}

export interface UnusedFile {
	path: string;
	description: string;
}

export interface AgentsClaudeWorkspaceContext {
	workspaceName: string;
	projectType: ProjectType;
	packageManager: PackageManagerInfo;
	packageJson?: PackageJsonInfo;
	scripts: WorkspaceScript[];
	esbuildEntries: EsbuildEntryPoint[];
	typescript?: TypeScriptInfo;
	vscode?: VscodeWorkspaceInfo;
	files: WorkspaceFilesInfo;
	staticSiteInfo?: StaticSiteInfo;
	keyPaths: WorkspacePathInfo[];
	existingInstructions: ExistingInstructionInfo;
	detectedFrameworks: DetectedFramework[];
	sourceEntryPoints: SourceEntryPoint[];
	caveats: ProjectCaveat[];
	unusedFiles: UnusedFile[];
	hasLinter: boolean;
	hasFormatter: boolean;
	hasTestRunner: boolean;
	hasViteConfig: boolean;
}
