export interface InstallMarketplaceSkill {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
}

export interface OfficialSkillSource {
	id: string;
	owner: string;
	displayName: string;
	featuredRepo: string;
	repoCount: number;
	skillCount: number;
	totalInstalls: number | null;
}

export interface InstallSkillsRequestMessage {
	type: 'installSkills.request';
	refresh?: boolean;
}

export interface InstallSkillsMoreRequestMessage {
	type: 'installSkills.more.request';
}

export interface InstallSkillsSearchRequestMessage {
	type: 'installSkills.search.request';
	query: string;
	requestId: number;
	limit?: number;
}

export interface OfficialSourcesRequestMessage {
	type: 'officialSources.request';
}

export interface OfficialSkillsRequestMessage {
	type: 'officialSkills.request';
	owner: string;
}

export interface Trending24hRequestMessage {
	type: 'trending24h.request';
}

export interface FlameSkillsRequestMessage {
	type: 'flameSkills.request';
}

export interface Trending24hUpdateMessage {
	type: 'trending24h.update';
	skills: InstallMarketplaceSkill[];
	isLoading: boolean;
	error: string | null;
}

export interface FlameSkillsUpdateMessage {
	type: 'flameSkills.update';
	skills: InstallMarketplaceSkill[];
	isLoading: boolean;
	error: string | null;
}

export interface FlameSkillDetailMessage {
	type: 'flameSkill.viewDetail';
	id: string;
	skillId: string;
	name: string;
	source: string;
}

export interface OfficialSourcesUpdateMessage {
	type: 'officialSources.update';
	sources: OfficialSkillSource[];
	isLoading: boolean;
	error: string | null;
}

export interface OfficialSkillsUpdateMessage {
	type: 'officialSkills.update';
	owner: string;
	skills: InstallMarketplaceSkill[];
	isLoading: boolean;
	error: string | null;
}

export interface InstallSkillsUpdateMessage {
	type: 'installSkills.update';
	skills: InstallMarketplaceSkill[];
	isLoading: boolean;
	error: string | null;
	hasMore: boolean;
	total: number | null;
	page: number;
}

export interface InstallSkillsSearchUpdateMessage {
	type: 'installSkills.search.update';
	query: string;
	requestId: number;
	skills: InstallMarketplaceSkill[];
	isLoading: boolean;
	error: string | null;
}

export type InstallSkillTarget = 'recommended' | 'claude';

export interface InstallSkillInstallMessage {
	type: 'installSkill.install';
	id: string;
	target?: InstallSkillTarget;
}

export interface InstallSkillStatusMessage {
	type: 'installSkill.status';
	id: string;
	status: 'idle' | 'installing' | 'installed' | 'failed';
}

export interface RawAllTimeSkill {
	id?: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
}

export interface SkillsLockFile {
	skills?: Record<string, unknown>;
}
