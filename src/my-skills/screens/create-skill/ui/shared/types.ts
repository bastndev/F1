export type CreateSkillMode = 'create' | 'search' | 'design';
export type CreateSkillTarget = 'agents' | 'claude';

export interface CreateSkillChatSubmitDetail {
	mode: CreateSkillMode;
	query: string;
	target?: CreateSkillTarget;
}
