/**
 * Owns all install-marketplace state and network loaders for the My Skills view:
 * the all-time paginated list, search, trending (24h + flame), official sources
 * and their per-owner skills, plus installing a skill and re-filtering every pool
 * against what is already installed. Extracted from core/main.ts so the provider
 * stays a thin router. Reaches the webview and cross-screen side effects only
 * through InstallSkillsHost — it never owns the WebviewView lifecycle.
 */
import * as vscode from 'vscode';
import { fetchAllTimeSkillsPage, fetchFlameSkills, fetchOfficialSkillsForOwner, fetchOfficialSkillSources, fetchTrending24hSkills, searchMarketplaceSkills } from '../screens/install-skill/core/marketplace';
import { cancelInstallMarketplaceSkill, installMarketplaceSkill } from '../screens/install-skill/core/installer';
import type { InstallMarketplaceSkill, InstallSkillCancelMessage, InstallSkillInstallMessage, InstallSkillsSearchRequestMessage, OfficialSkillSource, SkillsLockFile } from '../screens/install-skill/core/types';
import { FLAME_SKILL_SOURCE } from '../screens/install-skill/ui/panels/trending-skill/flame/data/flame-skills';
import { AsyncListSection } from './install-state';

/** Bridge to the provider's webview and cross-screen side effects. */
export interface InstallSkillsHost {
	hasView(): boolean;
	postMessage(message: unknown): Thenable<boolean> | undefined;
	onSkillInstalled(): Promise<void>;
}

export class InstallSkillsController {
	private _installSkills: InstallMarketplaceSkill[] = [];
	private _isLoadingInstallSkills = false;
	private _installSkillsError: string | null = null;
	private _installSkillsPage = -1;
	private _installSkillsHasMore = true;
	private _installSkillsTotal: number | null = null;
	private _searchSkillsByQuery = new Map<string, InstallMarketplaceSkill[]>();
	private readonly _trending24h = new AsyncListSection<InstallMarketplaceSkill[]>(
		[],
		skills => skills.length > 0,
		skills => (skills.length === 0 ? 'No trending skills found. Try refreshing.' : null),
	);
	private readonly _flame = new AsyncListSection<InstallMarketplaceSkill[]>(
		[],
		skills => skills.length > 0,
		skills => (skills.length === 0 ? 'No skills found in the flame repository.' : null),
	);
	private _createSearchSkills: InstallMarketplaceSkill[] = [];
	private readonly _officialSources = new AsyncListSection<OfficialSkillSource[]>(
		[],
		sources => sources.length > 0,
		sources => (sources.length === 0 ? 'No official sources found. Try refreshing.' : null),
	);
	private _officialSkillsByOwner = new Map<string, InstallMarketplaceSkill[]>();
	private _loadingOfficialOwners = new Set<string>();
	private _officialOwnerErrors = new Map<string, string | null>();
	private _installedMarketplaceSkillIds = new Set<string>();
	private readonly _activeInstallControllers = new Map<string, AbortController>();

	constructor(private readonly _host: InstallSkillsHost) { }

	setCreateSearchSkills(skills: InstallMarketplaceSkill[]): void {
		this._createSearchSkills = skills;
	}

	public async postInstallSkills(refresh = false) {
		if (!this._host.hasView()) {
			return;
		}

		if (this._isLoadingInstallSkills) {
			await this._sendInstallSkillsUpdate();
			return;
		}

		if (!refresh && this._installSkills.length > 0) {
			await this._sendInstallSkillsUpdate();
			return;
		}

		if (refresh) {
			this._installSkills = [];
			this._installSkillsPage = -1;
			this._installSkillsHasMore = true;
			this._installSkillsTotal = null;
		}

		await this._loadInstallSkillsPage(0);
	}

	public async postMoreInstallSkills() {
		if (!this._host.hasView() || this._isLoadingInstallSkills || !this._installSkillsHasMore) {
			await this._sendInstallSkillsUpdate();
			return;
		}

		await this._loadInstallSkillsPage(this._installSkillsPage + 1);
	}

	private async _loadInstallSkillsPage(page: number) {
		this._isLoadingInstallSkills = true;
		this._installSkillsError = null;
		await this._sendInstallSkillsUpdate();

		try {
			this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
			const payload = await fetchAllTimeSkillsPage(page);
			const nextSkills = filterInstallableSkills(payload.skills, this._installedMarketplaceSkillIds);
			this._installSkills = page <= 0 ? nextSkills : mergeMarketplaceSkills(this._installSkills, nextSkills);
			this._installSkillsPage = payload.page;
			this._installSkillsHasMore = payload.hasMore && nextSkills.length > 0;
			this._installSkillsTotal = payload.total;
			if (this._installSkills.length === 0) {
				this._installSkillsError = 'No skills found. Try refreshing.';
			}
		} catch (err) {
			this._installSkillsError = err instanceof Error ? err.message : String(err);
			this._installSkillsHasMore = false;
		} finally {
			this._isLoadingInstallSkills = false;
			await this._sendInstallSkillsUpdate();
		}
	}

	private async _sendInstallSkillsUpdate() {
		await this._host.postMessage({
			type: 'installSkills.update',
			skills: this._installSkills,
			isLoading: this._isLoadingInstallSkills,
			error: this._installSkillsError,
			hasMore: this._installSkillsHasMore,
			total: this._installSkillsTotal,
			page: this._installSkillsPage,
		});
	}

	public async postSearchSkills(message: InstallSkillsSearchRequestMessage) {
		if (!this._host.hasView()) {
			return;
		}

		const query = message.query.trim();
		if (query.length < 2) {
			await this._host.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills: [],
				isLoading: false,
				error: null,
			});
			return;
		}

		const cacheKey = query.toLowerCase();
		const cached = this._searchSkillsByQuery.get(cacheKey);
		if (cached) {
			await this._host.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills: cached,
				isLoading: false,
				error: null,
			});
			return;
		}

		await this._host.postMessage({
			type: 'installSkills.search.update',
			query,
			requestId: message.requestId,
			skills: [],
			isLoading: true,
			error: null,
		});

		try {
			this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
			const skills = filterInstallableSkills(
				await searchMarketplaceSkills(query, message.limit ?? 120),
				this._installedMarketplaceSkillIds,
			);
			this._searchSkillsByQuery.set(cacheKey, skills);
			await this._host.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills,
				isLoading: false,
				error: null,
			});
		} catch (err) {
			await this._host.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills: [],
				isLoading: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	public async postTrending24hSkills(refresh = false) {
		if (!this._host.hasView()) {
			return;
		}

		await this._trending24h.load({
			refresh,
			fetch: async () => {
				this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
				return filterInstallableSkills(await fetchTrending24hSkills(), this._installedMarketplaceSkillIds);
			},
			send: () => this._sendTrending24hUpdate(),
		});
	}

	private async _sendTrending24hUpdate() {
		await this._host.postMessage({
			type: 'trending24h.update',
			skills: this._trending24h.data,
			isLoading: this._trending24h.isLoading,
			error: this._trending24h.error,
		});
	}

	public async postFlameSkills(refresh = false) {
		if (!this._host.hasView()) {
			return;
		}

		await this._flame.load({
			refresh,
			fetch: async () => {
				this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
				return filterInstallableSkills(await fetchFlameSkills(FLAME_SKILL_SOURCE), this._installedMarketplaceSkillIds);
			},
			send: () => this._sendFlameSkillsUpdate(),
		});
	}

	private async _sendFlameSkillsUpdate() {
		await this._host.postMessage({
			type: 'flameSkills.update',
			skills: this._flame.data,
			isLoading: this._flame.isLoading,
			error: this._flame.error,
		});
	}

	public async postOfficialSources(refresh = false) {
		if (!this._host.hasView()) {
			return;
		}

		await this._officialSources.load({
			refresh,
			fetch: () => fetchOfficialSkillSources(),
			send: () => this._sendOfficialSourcesUpdate(),
		});
	}

	private async _sendOfficialSourcesUpdate() {
		await this._host.postMessage({
			type: 'officialSources.update',
			sources: this._officialSources.data,
			isLoading: this._officialSources.isLoading,
			error: this._officialSources.error,
		});
	}

	public async postOfficialSkills(owner: string, refresh = false) {
		if (!this._host.hasView()) {
			return;
		}

		const normalizedOwner = owner.trim().toLowerCase();
		if (!normalizedOwner) {
			return;
		}

		if (this._loadingOfficialOwners.has(normalizedOwner)) {
			await this._sendOfficialSkillsUpdate(normalizedOwner);
			return;
		}

		if (!refresh && this._officialSkillsByOwner.has(normalizedOwner)) {
			await this._sendOfficialSkillsUpdate(normalizedOwner);
			return;
		}

		this._loadingOfficialOwners.add(normalizedOwner);
		this._officialOwnerErrors.set(normalizedOwner, null);
		await this._sendOfficialSkillsUpdate(normalizedOwner);

		try {
			this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
			const skills = filterInstallableSkills(await fetchOfficialSkillsForOwner(normalizedOwner), this._installedMarketplaceSkillIds);
			this._officialSkillsByOwner.set(normalizedOwner, skills);
			if (skills.length === 0) {
				this._officialOwnerErrors.set(normalizedOwner, 'No installable official skills found.');
			}
		} catch (err) {
			this._officialOwnerErrors.set(normalizedOwner, err instanceof Error ? err.message : String(err));
		} finally {
			this._loadingOfficialOwners.delete(normalizedOwner);
			await this._sendOfficialSkillsUpdate(normalizedOwner);
		}
	}

	private async _sendOfficialSkillsUpdate(owner: string) {
		await this._host.postMessage({
			type: 'officialSkills.update',
			owner,
			skills: this._officialSkillsByOwner.get(owner) ?? [],
			isLoading: this._loadingOfficialOwners.has(owner),
			error: this._officialOwnerErrors.get(owner) ?? null,
		});
	}

	public async installSkill(message: InstallSkillInstallMessage) {
		const skill = this._findMarketplaceSkill(message.id);
		if (!skill) {
			void vscode.window.showErrorMessage(vscode.l10n.t('My Skills could not find this skill in the marketplace list.'));
			return;
		}

		if (this._activeInstallControllers.has(skill.id)) {
			return;
		}

		const controller = new AbortController();
		this._activeInstallControllers.set(skill.id, controller);

		await this._host.postMessage({
			type: 'installSkill.status',
			id: skill.id,
			status: 'installing',
		});

		const didInstall = await installMarketplaceSkill(skill, controller.signal, () => {
			void this._host.postMessage({
				type: 'installSkill.status',
				id: skill.id,
				status: 'downloading',
			});
		});

		this._activeInstallControllers.delete(skill.id);

		if (!didInstall && controller.signal.aborted) {
			await this._host.postMessage({
				type: 'installSkill.status',
				id: skill.id,
				status: 'idle',
			});
			return;
		}

		if (didInstall) {
			this._installedMarketplaceSkillIds.add(skill.skillId);
			this._installSkills = filterInstallableSkills(this._installSkills, this._installedMarketplaceSkillIds);
			this._trending24h.data = filterInstallableSkills(this._trending24h.data, this._installedMarketplaceSkillIds);
			this._flame.data = filterInstallableSkills(this._flame.data, this._installedMarketplaceSkillIds);
			this._createSearchSkills = filterInstallableSkills(this._createSearchSkills, this._installedMarketplaceSkillIds);
			this._officialSkillsByOwner.forEach((skills, owner) => {
				this._officialSkillsByOwner.set(owner, filterInstallableSkills(skills, this._installedMarketplaceSkillIds));
			});
			this._searchSkillsByQuery.forEach((skills, query) => {
				this._searchSkillsByQuery.set(query, filterInstallableSkills(skills, this._installedMarketplaceSkillIds));
			});
		}

		await this._host.postMessage({
			type: 'installSkill.status',
			id: skill.id,
			status: didInstall ? 'installed' : 'idle',
		});

		if (didInstall) {
			await this._sendInstallSkillsUpdate();
			await this._sendTrending24hUpdate();
			await this._sendFlameSkillsUpdate();
			await Promise.all(Array.from(this._officialSkillsByOwner.keys(), owner => this._sendOfficialSkillsUpdate(owner)));
			await this._host.onSkillInstalled();
		}
	}

	public cancelInstallSkill(message: InstallSkillCancelMessage): void {
		this._activeInstallControllers.get(message.id)?.abort();
		this._activeInstallControllers.delete(message.id);
		cancelInstallMarketplaceSkill(message.id);
	}

	private _findMarketplaceSkill(id: string): InstallMarketplaceSkill | undefined {
		return this._installSkills.find(candidate => candidate.id === id)
			?? this._trending24h.data.find(candidate => candidate.id === id)
			?? this._flame.data.find(candidate => candidate.id === id)
			?? this._createSearchSkills.find(candidate => candidate.id === id)
			?? Array.from(this._officialSkillsByOwner.values()).flat().find(candidate => candidate.id === id)
			?? Array.from(this._searchSkillsByQuery.values()).flat().find(candidate => candidate.id === id);
	}
}

async function getInstalledMarketplaceSkillIds(): Promise<Set<string>> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return new Set();
	}

	try {
		const lockUri = vscode.Uri.joinPath(workspaceFolder.uri, 'skills-lock.json');
		const content = Buffer.from(await vscode.workspace.fs.readFile(lockUri)).toString('utf8');
		const parsed = JSON.parse(content) as SkillsLockFile;
		return new Set(Object.keys(parsed.skills ?? {}));
	} catch {
		return new Set();
	}
}

function filterInstallableSkills(
	skills: InstallMarketplaceSkill[],
	installedSkillIds: Set<string>,
): InstallMarketplaceSkill[] {
	return skills.filter(skill => !installedSkillIds.has(skill.id) && !installedSkillIds.has(skill.skillId) && !installedSkillIds.has(skill.name));
}

function mergeMarketplaceSkills(
	currentSkills: InstallMarketplaceSkill[],
	nextSkills: InstallMarketplaceSkill[],
): InstallMarketplaceSkill[] {
	const seen = new Set(currentSkills.map(skill => skill.id));
	const merged = [...currentSkills];

	for (const skill of nextSkills) {
		if (seen.has(skill.id)) {
			continue;
		}

		seen.add(skill.id);
		merged.push(skill);
	}

	return merged;
}
