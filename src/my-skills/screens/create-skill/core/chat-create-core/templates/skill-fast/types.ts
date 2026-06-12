export type SkillFastArchetypeId =
	| 'design-rulebook'
	| 'technical-guide'
	| 'workflow-pipeline'
	| 'security-playbook'
	| 'best-practices'
	| 'integration-guide'
	| 'database-playbook'
	| 'testing-playbook';

export interface SkillFastTemplate {
	id: string;
	categoryId: string;
	title: string;
	overview: string;
	instructions: string[];
	output: string;
	exampleInput: string;
	exampleOutput: string;
	referenceHints: string[];
}

export interface SkillFastRenderContext {
	name: string;
	techs: string[];
	userDescription: string;
	activationDescription: string;
	referenceInstructions: string;
	referenceSections?: SkillFastReferenceSection[];
}

export interface SkillFastReferenceSection {
	title: string;
	body: string;
}
