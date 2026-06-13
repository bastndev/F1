export interface DesignColorOption {
	id: string;
	name: string;
	description: string;
	primary: string;
	palette: string[];
	hex: string[];
}

export interface DesignTypographyOption {
	id: string;
	name: string;
	description: string;
	source: 'system' | 'google' | 'local' | 'custom';
	families: string[];
	weights: number[];
	defaultWeight: number;
	url?: string;
	sample?: string;
	tone?: 'sans' | 'serif' | 'mono' | 'condensed' | 'display';
}

export type DesignStyleTone = 'bento' | 'neumorphism' | 'artistic' | 'minimalistic' | 'clean' | 'perspective' | 'premium' | 'refined' | 'neobrutalism' | 'glassmorphism' | 'liquid-glass' | 'shadcn' | 'cafe' | 'pacman' | 'dashboard' | 'matrix' | '80s' | 'school';

export interface DesignStyleOption {
	id: string;
	name: string;
	description: string;
	references: string[];
	tone?: DesignStyleTone;
	intent?: string;
	layoutRules?: string[];
	componentRules?: string[];
	refactorRules?: string[];
	spacingRules?: string[];
	visualHierarchyRules?: string[];
	doRules?: string[];
	dontRules?: string[];
	aiChecklist?: string[];
}

export interface DesignMdSelection {
	color?: DesignColorOption;
	typography?: DesignTypographyOption;
	style?: DesignStyleOption;
	skipColor?: boolean;
	skipTypography?: boolean;
	skipStyle?: boolean;
}
