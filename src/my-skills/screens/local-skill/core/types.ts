export type LocalSkillKind = 'file' | 'folder';

export interface LocalSkill {
	id: string;
	name: string;
	description?: string;
	source: string;
	kind: LocalSkillKind;
	icon?: string;
	enabled: boolean;
	installedAt: number;
}

export interface LocalSkillsUpdateMessage {
	type: 'localSkills.update';
	skills: LocalSkill[];
}

export interface LocalSkillsRequestMessage {
	type: 'localSkills.request';
}

export interface LocalSkillSetEnabledMessage {
	type: 'localSkill.setEnabled';
	id: string;
	enabled: boolean;
}

export interface LocalSkillDeleteMessage {
	type: 'localSkill.delete';
	id: string;
}

export interface LocalSkillOpenMessage {
	type: 'localSkill.open';
	id: string;
}

export interface LocalSkillSaveMessage {
	type: 'localSkill.save';
	id: string;
}

export interface LocalSkillsSavedRequestMessage {
	type: 'localSkills.saved.request';
}

export interface LocalSkillsSavedUpdateMessage {
	type: 'localSkills.saved.update';
	skills: LocalSkill[];
}

export interface LocalSkillDeleteSavedMessage {
	type: 'localSkill.deleteSaved';
	id: string;
}

export interface LocalSkillEnableSavedMessage {
	type: 'localSkill.enableSaved';
	id: string;
}
