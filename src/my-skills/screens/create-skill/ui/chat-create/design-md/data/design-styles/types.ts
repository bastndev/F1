import type { DesignStyleOption } from '../../core/types';

export interface DesignStyleProfile extends DesignStyleOption {
	intent: string;
	layoutRules: string[];
	componentRules: string[];
	refactorRules: string[];
	spacingRules: string[];
	visualHierarchyRules: string[];
	doRules: string[];
	dontRules: string[];
	aiChecklist: string[];
}

