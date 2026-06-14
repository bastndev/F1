export type ProjectCategory =
	| 'web'
	| 'mobile'
	| 'backend'
	| 'database'
	| 'testing'
	| 'infra'
	| 'ai'
	| 'security'
	| 'language'
	| 'tooling'
	| 'design'
	| 'extension'
	| 'quality'
	| 'docs';

export interface TechnologyRule {
	id: string;
	name: string;
	categories: ProjectCategory[];
	packages?: string[];
	packagePrefixes?: string[];
	configFiles?: string[];
	fileExtensions?: string[];
	contentMatches?: ConfigContentMatch[];
	skills: string[];
	searchTerms?: string[];
}

export interface ConfigContentMatch {
	files: string[];
	terms: string[];
}

export interface ComboRule {
	id: string;
	name: string;
	requires: string[];
	categories: ProjectCategory[];
	skills: string[];
	searchTerms?: string[];
}

export interface DetectedTechnology {
	id: string;
	name: string;
	categories: ProjectCategory[];
	sources: string[];
	skills: string[];
	searchTerms: string[];
}

export interface DetectedCombo {
	id: string;
	name: string;
	requires: string[];
	categories: ProjectCategory[];
	skills: string[];
	searchTerms: string[];
}

export interface ProjectAnalysis {
	technologies: DetectedTechnology[];
	combos: DetectedCombo[];
	categories: ProjectCategory[];
	workspaceName: string;
}
