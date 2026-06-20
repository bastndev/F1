import * as vscode from 'vscode';
import * as fs from 'fs';
import { createSkillsFromGithubSkillUrls, fetchAllTimeSkillsPage, fetchOfficialSkillsForOwner, fetchOfficialSkillSources, fetchTrending24hSkills, searchMarketplaceSkills } from './screens/install-skill/core/marketplace';
import { installMarketplaceSkill } from './screens/install-skill/core/installer';
import type { FlameSkillsRequestMessage, InstallMarketplaceSkill, InstallSkillInstallMessage, InstallSkillsMoreRequestMessage, InstallSkillsRequestMessage, InstallSkillsSearchRequestMessage, OfficialSkillSource, OfficialSkillsRequestMessage, OfficialSourcesRequestMessage, SkillsLockFile, Trending24hRequestMessage } from './screens/install-skill/core/types';
import { FLAME_SKILL_URLS } from './screens/install-skill/ui/panels/trending-skill/flame/data/flame-skills';
import { ROOT_SKILL_FILE_NAMES, ROOT_SKILL_FOLDER_WATCH_PATTERNS, deleteWorkspaceRootSkill, getWorkspaceRootSkills, setWorkspaceRootSkillEnabled } from './screens/local-skill/core/local-skills';
import { deleteSavedSkill, enableSavedSkill, getSavedSkills, isSavedSkillInWorkspace, saveSkill } from './screens/local-skill/core/saved-skills';
import type { LocalSkillDeleteMessage, LocalSkillDeleteSavedMessage, LocalSkillEnableSavedMessage, LocalSkillOpenMessage, LocalSkillSaveMessage, LocalSkillSetEnabledMessage, LocalSkillsRequestMessage, LocalSkillsSavedRequestMessage } from './screens/local-skill/core/types';
import { clearSearchRecommendationCache, getSearchRecommendationPreview, getSearchRecommendations, prewarmSearchRecommendations, type SearchRecommendationResult } from './screens/create-skill/core/chat-search-core';
import { createAgentsClaudeInstructionMarkdown, isAgentsClaudeInstructionFileName, type AgentsClaudeInstructionFileName } from './screens/create-skill/core/agents-claude-md';

import { createDesignMdMarkdown } from './screens/create-skill/ui/chat-create/design-md/core/markdown';
import type { DesignMdSelection } from './screens/create-skill/ui/chat-create/design-md/core/types';
import { designColorOptions } from './screens/create-skill/ui/chat-create/design-md/data/colors';
import { designStyleOptions } from './screens/create-skill/ui/chat-create/design-md/data/styles';
import { designTypographyOptions } from './screens/create-skill/ui/chat-create/design-md/data/typography';
import { createSkillBoilerplate } from './screens/create-skill/core/chat-create-core/skill-generator';
import { translateQuery } from './screens/create-skill/core/shared/project-translation';
import { resetFastContext, updateFastDescription, updateFastName, updateFastTechnologies, waitForPendingBackgroundFetches } from './screens/create-skill/core/chat-create-core/fast-context-manager';

const CREATE_ROOT_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md', 'DESIGN.md'] as const;
const CREATE_ROOT_INSTRUCTION_MINIMUM_LOADING_MS = 1200;

interface CreateSkillSearchRequestMessage {
	type: 'createSkill.search.request';
	query: string;
	requestId: number;
	limit?: number;
}

interface CreateSkillSearchPrefetchMessage {
	type: 'createSkill.search.prefetch';
}

interface CreateSkillSearchTypingMessage {
	type: 'createSkill.search.typing';
	query: string;
}

interface CreateSkillFastNameConfirmedMessage {
	type: 'createSkill.fast.nameConfirmed';
	name: string;
}

interface CreateSkillFastTechsSelectedMessage {
	type: 'createSkill.fast.techsSelected';
	categories: string[];
}

interface CreateSkillRootInstructionCreateMessage {
	type: 'createSkill.rootFile.create';
	fileName: AgentsClaudeInstructionFileName;
}

interface CreateSkillDesignSelectionMessage {
	colorId?: string;
	typographyId?: string;
	styleId?: string;
	skipColor?: boolean;
	skipTypography?: boolean;
	skipStyle?: boolean;
}

interface CreateSkillDesignCreateMessage {
	type: 'createSkill.design.create';
	selection: CreateSkillDesignSelectionMessage;
	overwrite?: boolean;
}

interface CreateSkillChatTypingMessage {
	type: 'createSkill.chat.typing';
	query: string;
}

interface CreateSkillChatCreateMessage {
	type: 'createSkill.chat.create';
	name: string;
	query: string;
	target: 'agents' | 'claude';
	template: 'base' | 'fast' | 'ai';
}

type CreateSkillDesignStatus = 'writing' | 'created' | 'error';
type CreateSkillRootInstructionStatus = 'writing' | 'created' | 'error';

export class MySkillsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'myskills-panel';
	private _view?: vscode.WebviewView;
	private _supportPanel?: vscode.WebviewPanel;
	private _localSkillWatchers: vscode.FileSystemWatcher[] = [];
	private _installSkills: InstallMarketplaceSkill[] = [];
	private _isLoadingInstallSkills = false;
	private _installSkillsError: string | null = null;
	private _installSkillsPage = -1;
	private _installSkillsHasMore = true;
	private _installSkillsTotal: number | null = null;
	private _searchSkillsByQuery = new Map<string, InstallMarketplaceSkill[]>();
	private _trending24hSkills: InstallMarketplaceSkill[] = [];
	private _isLoadingTrending24h = false;
	private _trending24hError: string | null = null;
	private _flameSkills: InstallMarketplaceSkill[] = [];
	private _createSearchSkills: InstallMarketplaceSkill[] = [];
	private _isLoadingFlameSkills = false;
	private _flameSkillsError: string | null = null;
	private _officialSources: OfficialSkillSource[] = [];
	private _isLoadingOfficialSources = false;
	private _officialSourcesError: string | null = null;
	private _officialSkillsByOwner = new Map<string, InstallMarketplaceSkill[]>();
	private _loadingOfficialOwners = new Set<string>();
	private _officialOwnerErrors = new Map<string, string | null>();
	private _installedMarketplaceSkillIds = new Set<string>();

	constructor(
		private readonly _context: vscode.ExtensionContext,
	) { }

	private get _extensionUri(): vscode.Uri {
		return this._context.extensionUri;
	}

	private get _globalStorageUri(): vscode.Uri {
		return this._context.globalStorageUri;
	}

	public async openCreateView() {
		await vscode.commands.executeCommand('workbench.view.extension.myskills-activity');
		await vscode.commands.executeCommand(`${MySkillsViewProvider.viewType}.focus`);
		this._view?.show(false);
		await this._view?.webview.postMessage({ type: 'switch-tab', target: 'create-panel' });
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		const nonce = getNonce();

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.onDidReceiveMessage(message => {
			if (isWebviewMessage(message) && message.type === 'createSkill.openSupport') {
				this._openCreateSkillSupport();
			}
			if (isWebviewMessage(message) && message.type === 'createSkill.rootFiles.request') {
				void this._postCreateRootFileStatus();
			}
			if (isCreateSkillRootInstructionCreateMessage(message)) {
				void this._createAgentsClaudeInstructionFile(message);
			}
			if (isCreateSkillDesignCreateMessage(message)) {
				void this._createDesignMarkdown(message);
			}

			if (isCreateSkillChatCreateMessage(message)) {
				void this._createChatSkill(message);
			}
			if (isCreateSkillSearchRequestMessage(message)) {
				void this._postCreateSkillSearchRecommendations(message);
			}
			if (isCreateSkillSearchPrefetchMessage(message)) {
				void prewarmSearchRecommendations();
			}
			if (isCreateSkillSearchTypingMessage(message)) {
				void translateQuery(message.query);
			}
			if (isCreateSkillFastNameConfirmedMessage(message)) {
				updateFastName(message.name);
			}
			if (isCreateSkillFastTechsSelectedMessage(message)) {
				updateFastTechnologies(message.categories);
			}
			if (isLocalSkillsRequestMessage(message)) {
				void this._postLocalSkills();
			}
			if (isLocalSkillSetEnabledMessage(message)) {
				void this._setLocalSkillEnabled(message);
			}
			if (isLocalSkillDeleteMessage(message)) {
				void this._deleteLocalSkill(message);
			}
			if (isLocalSkillOpenMessage(message)) {
				void this._openLocalSkill(message);
			}
			if (isLocalSkillSaveMessage(message)) {
				void this._saveLocalSkill(message);
			}
			if (isLocalSkillsSavedRequestMessage(message)) {
				void this._postSavedSkills();
			}
			if (isLocalSkillEnableSavedMessage(message)) {
				void this._enableSavedSkill(message);
			}
			if (isLocalSkillDeleteSavedMessage(message)) {
				void this._deleteSavedSkill(message);
			}
			if (isInstallSkillsRequestMessage(message)) {
				void this._postInstallSkills(message.refresh ?? true);
			}
			if (isInstallSkillsMoreRequestMessage(message)) {
				void this._postMoreInstallSkills();
			}
			if (isInstallSkillsSearchRequestMessage(message)) {
				void this._postSearchSkills(message);
			}
			if (isTrending24hRequestMessage(message)) {
				void this._postTrending24hSkills(true);
			}
			if (isFlameSkillsRequestMessage(message)) {
				void this._postFlameSkills(true);
			}
			if (isOfficialSourcesRequestMessage(message)) {
				void this._postOfficialSources(true);
			}
			if (isOfficialSkillsRequestMessage(message)) {
				void this._postOfficialSkills(message.owner, true);
			}
			if (isInstallSkillInstallMessage(message)) {
				void this._installMarketplaceSkill(message);
			}
		});

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, nonce);
		this._watchWorkspaceLocalSkills();
	}

	public switchTab(target: string) {
		if (this._view) {
			this._view.webview.postMessage({ type: 'switch-tab', target });
		}
	}

	private async _postLocalSkills() {
		if (!this._view) {
			return;
		}

		const skills = await getWorkspaceRootSkills();
		await this._view.webview.postMessage({ type: 'localSkills.update', skills });
	}

	private async _postCreateRootFileStatus() {
		if (!this._view) {
			return;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const files: Record<string, boolean> = {};

		await Promise.all(CREATE_ROOT_FILE_NAMES.map(async fileName => {
			if (!workspaceFolder) {
				files[fileName] = false;
				return;
			}

			try {
				const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, fileName));
				files[fileName] = stat.type === vscode.FileType.File;
			} catch {
				files[fileName] = false;
			}
		}));

		await this._view.webview.postMessage({ type: 'createSkill.rootFiles.update', files });
	}

	private async _createAgentsClaudeInstructionFile(message: CreateSkillRootInstructionCreateMessage) {
		const startedAt = Date.now();
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			await waitForMinimumDuration(startedAt, CREATE_ROOT_INSTRUCTION_MINIMUM_LOADING_MS);
			await this._postCreateRootInstructionStatus(message.fileName, 'error', 'Open a workspace first');
			return;
		}

		const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, message.fileName);
		await this._postCreateRootInstructionStatus(message.fileName, 'writing', 'Writing');

		try {
			const stat = await vscode.workspace.fs.stat(targetUri);
			if (stat.type === vscode.FileType.File) {
				await waitForMinimumDuration(startedAt, CREATE_ROOT_INSTRUCTION_MINIMUM_LOADING_MS);
				await this._postCreateRootInstructionStatus(message.fileName, 'error', `${message.fileName} already exists`);
				await this._postCreateRootFileStatus();
				return;
			}
		} catch {
			// Missing is the expected case. The write below will surface real failures.
		}

		try {
			const markdown = await createAgentsClaudeInstructionMarkdown({
				fileName: message.fileName,
				workspaceUri: workspaceFolder.uri,
				workspaceName: getWorkspaceName(),
			});
			await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(ensureTrailingNewline(markdown)));
			clearSearchRecommendationCache();
			await waitForMinimumDuration(startedAt, CREATE_ROOT_INSTRUCTION_MINIMUM_LOADING_MS);
			await this._postCreateRootInstructionStatus(message.fileName, 'created', 'Created');
			await this._postCreateRootFileStatus();
			await this._postLocalSkills();
			await this._postCreateDesignReturnToLocal();
		} catch (err) {
			console.error(`[MySkills] Failed to create ${message.fileName}: ${err}`);
			await waitForMinimumDuration(startedAt, CREATE_ROOT_INSTRUCTION_MINIMUM_LOADING_MS);
			await this._postCreateRootInstructionStatus(message.fileName, 'error', `Could not write ${message.fileName}`);
		}
	}

	private async _createDesignMarkdown(message: CreateSkillDesignCreateMessage) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			await this._postCreateDesignStatus('error', 'Open a workspace first');
			return;
		}

		const selection = resolveDesignMdSelection(message.selection);
		if (!selection) {
			await this._postCreateDesignStatus('error', 'Invalid design choices');
			return;
		}

		await this._postCreateDesignStatus('writing', 'Writing');

		const designUri = vscode.Uri.joinPath(workspaceFolder.uri, 'DESIGN.md');
		try {
			await vscode.workspace.fs.stat(designUri);
			if (!message.overwrite) {
				await this._postCreateDesignStatus('error', 'DESIGN.md already exists');
				await this._postCreateRootFileStatus();
				return;
			}
		} catch {
			// Missing is the expected case. The write below will surface real failures.
		}

		try {
			const markdown = createDesignMdMarkdown(selection, {
				productName: getWorkspaceName(),
			});
			await vscode.workspace.fs.writeFile(designUri, new TextEncoder().encode(ensureTrailingNewline(markdown)));
			clearSearchRecommendationCache();
			await this._postCreateDesignStatus('created', message.overwrite ? 'Updated' : 'Created');
			await this._postCreateRootFileStatus();
			await this._postLocalSkills();
			await this._postCreateDesignReturnToLocal();
		} catch (err) {
			console.error(`[MySkills] Failed to create DESIGN.md: ${err}`);
			await this._postCreateDesignStatus('error', 'Could not write DESIGN.md');
		}
	}

	private async _createChatSkill(message: CreateSkillChatCreateMessage) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			await vscode.window.showErrorMessage('Open a workspace first to create a skill.');
			return;
		}

		try {
			const skillQuery = message.template === 'fast'
				? await translateQuery(message.query, 'en')
				: message.query;
			const skillMessage: CreateSkillChatCreateMessage = message.template === 'fast'
				? { ...message, query: skillQuery }
				: message;

			updateFastName(message.name);
			updateFastDescription(skillQuery);
			if (message.template !== 'fast') {
				updateFastTechnologies([]);
			}

			// Wait for up to 1.5s for any background fetching to finish
			// This perfectly aligns with the frontend's loading animation
			await waitForPendingBackgroundFetches(1500);

			await createSkillBoilerplate(workspaceFolder.uri, skillMessage);
			await this._postLocalSkills();
			await this._postCreateSkillResult(true, 'Skill created');
		} catch (err) {
			console.error(`[MySkills] Failed to create chat skill: ${err}`);
			await this._postCreateSkillResult(false, 'Failed to create skill. Check output logs.');
			await vscode.window.showErrorMessage('Failed to create skill. Check output logs.');
		} finally {
			resetFastContext();
		}
	}



	private async _postCreateRootInstructionStatus(fileName: AgentsClaudeInstructionFileName, status: CreateSkillRootInstructionStatus, message: string) {
		await this._view?.webview.postMessage({
			type: 'createSkill.rootFile.status',
			fileName,
			status,
			message,
		});
	}

	private async _postCreateDesignReturnToLocal() {
		await this._view?.webview.postMessage({
			type: 'createSkill.design.returnToLocal',
		});
	}

	private async _postCreateDesignStatus(status: CreateSkillDesignStatus, message: string) {
		await this._view?.webview.postMessage({
			type: 'createSkill.design.status',
			status,
			message,
		});
	}

	private async _postCreateSkillResult(success: boolean, message: string) {
		await this._view?.webview.postMessage({
			type: 'createSkillResult',
			success,
			message,
		});
	}

	private async _postCreateSkillSearchRecommendations(message: CreateSkillSearchRequestMessage) {
		if (!this._view) {
			return;
		}

		const query = message.query.trim();
		await this._view.webview.postMessage({
			type: 'createSkill.search.update',
			query,
			requestId: message.requestId,
			technologies: [],
			combos: [],
			categories: [],
			recommendations: [],
			isLoading: true,
			error: null,
		});

		try {
			const translatedQuery = await translateQuery(query);

			const preview = await getSearchRecommendationPreview({
				query: translatedQuery,
				limit: message.limit ?? 5,
			});

			if (preview.technologies.length > 0) {
				await this._view.webview.postMessage({
					type: 'createSkill.search.update',
					requestId: message.requestId,
					isLoading: true,
					error: null,
					...toCreateSkillSearchPayload(preview),
					recommendations: [],
				});
			}

			const result = await getSearchRecommendations({
				query: translatedQuery,
				limit: message.limit ?? 5,
			});
			this._createSearchSkills = result.recommendations.map(recommendation => recommendation.skill);

			await this._view.webview.postMessage({
				type: 'createSkill.search.update',
				requestId: message.requestId,
				isLoading: false,
				error: null,
				...toCreateSkillSearchPayload(result),
			});
		} catch (err) {
			await this._view.webview.postMessage({
				type: 'createSkill.search.update',
				query,
				requestId: message.requestId,
				resultKind: 'recommendations',
				title: 'Best skills for your project...',
				kicker: 'Recommended',
				technologies: [],
				combos: [],
				categories: [],
				recommendations: [],
				isLoading: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private async _postInstallSkills(refresh = false) {
		if (!this._view) {
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

	private async _postMoreInstallSkills() {
		if (!this._view || this._isLoadingInstallSkills || !this._installSkillsHasMore) {
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
		await this._view?.webview.postMessage({
			type: 'installSkills.update',
			skills: this._installSkills,
			isLoading: this._isLoadingInstallSkills,
			error: this._installSkillsError,
			hasMore: this._installSkillsHasMore,
			total: this._installSkillsTotal,
			page: this._installSkillsPage,
		});
	}

	private async _postSearchSkills(message: InstallSkillsSearchRequestMessage) {
		if (!this._view) {
			return;
		}

		const query = message.query.trim();
		if (query.length < 2) {
			await this._view.webview.postMessage({
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
			await this._view.webview.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills: cached,
				isLoading: false,
				error: null,
			});
			return;
		}

		await this._view.webview.postMessage({
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
			await this._view.webview.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills,
				isLoading: false,
				error: null,
			});
		} catch (err) {
			await this._view.webview.postMessage({
				type: 'installSkills.search.update',
				query,
				requestId: message.requestId,
				skills: [],
				isLoading: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private async _postTrending24hSkills(refresh = false) {
		if (!this._view) {
			return;
		}

		if (this._isLoadingTrending24h) {
			await this._sendTrending24hUpdate();
			return;
		}

		if (!refresh && this._trending24hSkills.length > 0) {
			await this._sendTrending24hUpdate();
			return;
		}

		this._isLoadingTrending24h = true;
		this._trending24hError = null;
		await this._sendTrending24hUpdate();

		try {
			this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
			this._trending24hSkills = filterInstallableSkills(await fetchTrending24hSkills(), this._installedMarketplaceSkillIds);
			if (this._trending24hSkills.length === 0) {
				this._trending24hError = 'No trending skills found. Try refreshing.';
			}
		} catch (err) {
			this._trending24hError = err instanceof Error ? err.message : String(err);
		} finally {
			this._isLoadingTrending24h = false;
			await this._sendTrending24hUpdate();
		}
	}

	private async _sendTrending24hUpdate() {
		await this._view?.webview.postMessage({
			type: 'trending24h.update',
			skills: this._trending24hSkills,
			isLoading: this._isLoadingTrending24h,
			error: this._trending24hError,
		});
	}

	private async _postFlameSkills(refresh = false) {
		if (!this._view) {
			return;
		}

		if (this._isLoadingFlameSkills) {
			await this._sendFlameSkillsUpdate();
			return;
		}

		if (!refresh && this._flameSkills.length > 0) {
			await this._sendFlameSkillsUpdate();
			return;
		}

		this._isLoadingFlameSkills = true;
		this._flameSkillsError = null;
		await this._sendFlameSkillsUpdate();

		try {
			this._installedMarketplaceSkillIds = await getInstalledMarketplaceSkillIds();
			this._flameSkills = filterInstallableSkills(createSkillsFromGithubSkillUrls(FLAME_SKILL_URLS), this._installedMarketplaceSkillIds);
		} catch (err) {
			this._flameSkillsError = err instanceof Error ? err.message : String(err);
		} finally {
			this._isLoadingFlameSkills = false;
			await this._sendFlameSkillsUpdate();
		}
	}

	private async _sendFlameSkillsUpdate() {
		await this._view?.webview.postMessage({
			type: 'flameSkills.update',
			skills: this._flameSkills,
			isLoading: this._isLoadingFlameSkills,
			error: this._flameSkillsError,
		});
	}

	private async _postOfficialSources(refresh = false) {
		if (!this._view) {
			return;
		}

		if (this._isLoadingOfficialSources) {
			await this._sendOfficialSourcesUpdate();
			return;
		}

		if (!refresh && this._officialSources.length > 0) {
			await this._sendOfficialSourcesUpdate();
			return;
		}

		this._isLoadingOfficialSources = true;
		this._officialSourcesError = null;
		await this._sendOfficialSourcesUpdate();

		try {
			this._officialSources = await fetchOfficialSkillSources();
			if (this._officialSources.length === 0) {
				this._officialSourcesError = 'No official sources found. Try refreshing.';
			}
		} catch (err) {
			this._officialSourcesError = err instanceof Error ? err.message : String(err);
		} finally {
			this._isLoadingOfficialSources = false;
			await this._sendOfficialSourcesUpdate();
		}
	}

	private async _sendOfficialSourcesUpdate() {
		await this._view?.webview.postMessage({
			type: 'officialSources.update',
			sources: this._officialSources,
			isLoading: this._isLoadingOfficialSources,
			error: this._officialSourcesError,
		});
	}

	private async _postOfficialSkills(owner: string, refresh = false) {
		if (!this._view) {
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
		await this._view?.webview.postMessage({
			type: 'officialSkills.update',
			owner,
			skills: this._officialSkillsByOwner.get(owner) ?? [],
			isLoading: this._loadingOfficialOwners.has(owner),
			error: this._officialOwnerErrors.get(owner) ?? null,
		});
	}

	private async _installMarketplaceSkill(message: InstallSkillInstallMessage) {
		const skill = this._findMarketplaceSkill(message.id);
		if (!skill) {
			void vscode.window.showErrorMessage('My Skills could not find this skill in the marketplace list.');
			return;
		}

		await this._view?.webview.postMessage({
			type: 'installSkill.status',
			id: skill.id,
			status: 'installing',
		});

		const didInstall = await installMarketplaceSkill(skill);
		if (didInstall) {
			this._installedMarketplaceSkillIds.add(skill.skillId);
			this._installSkills = filterInstallableSkills(this._installSkills, this._installedMarketplaceSkillIds);
			this._trending24hSkills = filterInstallableSkills(this._trending24hSkills, this._installedMarketplaceSkillIds);
			this._flameSkills = filterInstallableSkills(this._flameSkills, this._installedMarketplaceSkillIds);
			this._createSearchSkills = filterInstallableSkills(this._createSearchSkills, this._installedMarketplaceSkillIds);
			this._officialSkillsByOwner.forEach((skills, owner) => {
				this._officialSkillsByOwner.set(owner, filterInstallableSkills(skills, this._installedMarketplaceSkillIds));
			});
			this._searchSkillsByQuery.forEach((skills, query) => {
				this._searchSkillsByQuery.set(query, filterInstallableSkills(skills, this._installedMarketplaceSkillIds));
			});
		}

		await this._view?.webview.postMessage({
			type: 'installSkill.status',
			id: skill.id,
			status: didInstall ? 'installed' : 'idle',
		});

		if (didInstall) {
			await this._sendInstallSkillsUpdate();
			await this._sendTrending24hUpdate();
			await this._sendFlameSkillsUpdate();
			await Promise.all(Array.from(this._officialSkillsByOwner.keys(), owner => this._sendOfficialSkillsUpdate(owner)));
			await this._postLocalSkills();
			clearSearchRecommendationCache();
			await this._postCreateDesignReturnToLocal();
		}
	}

	private _findMarketplaceSkill(id: string): InstallMarketplaceSkill | undefined {
		return this._installSkills.find(candidate => candidate.id === id)
			?? this._trending24hSkills.find(candidate => candidate.id === id)
			?? this._flameSkills.find(candidate => candidate.id === id)
			?? this._createSearchSkills.find(candidate => candidate.id === id)
			?? Array.from(this._officialSkillsByOwner.values()).flat().find(candidate => candidate.id === id)
			?? Array.from(this._searchSkillsByQuery.values()).flat().find(candidate => candidate.id === id);
	}

	private async _setLocalSkillEnabled(message: LocalSkillSetEnabledMessage) {
		try {
			await setWorkspaceRootSkillEnabled(message.id, message.enabled);
		} catch (err) {
			console.error(`[MySkills] Failed to update .gitignore: ${err}`);
			void vscode.window.showErrorMessage('My Skills could not update .gitignore.');
		} finally {
			await this._postLocalSkills();
		}
	}

	private async _deleteLocalSkill(message: LocalSkillDeleteMessage) {
		const confirmed = await vscode.window.showWarningMessage(
			`Delete ${message.id}?`,
			{ modal: true, detail: 'The item will be moved to the trash when possible.' },
			'Delete',
		);

		if (confirmed !== 'Delete') {
			return;
		}

		try {
			await deleteWorkspaceRootSkill(message.id);
		} catch (err) {
			console.error(`[MySkills] Failed to delete local skill: ${err}`);
			void vscode.window.showErrorMessage('My Skills could not delete this item.');
		} finally {
			await this._postLocalSkills();
			if (isMarketplaceFolderSkillId(message.id)) {
				await this._postInstallSkills(true);
				await this._postTrending24hSkills(true);
				await this._postFlameSkills(true);
			}
		}
	}

	private async _openLocalSkill(message: LocalSkillOpenMessage) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		const skillUri = vscode.Uri.joinPath(workspaceFolder.uri, ...message.id.split('/'), 'SKILL.md');
		try {
			await vscode.commands.executeCommand('vscode.open', skillUri);
		} catch (err) {
			console.error(`[MySkills] Failed to open skill: ${err}`);
			void vscode.window.showErrorMessage('My Skills could not open this skill.');
		}
	}

	private async _saveLocalSkill(message: LocalSkillSaveMessage) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		const skillName = message.id.split('/').pop() ?? message.id;

		try {
			await saveSkill(this._globalStorageUri, workspaceFolder.uri, message.id);
			void vscode.window.showInformationMessage(`Skill '${skillName}' saved successfully ✅.`);
		} catch (err) {
			console.error(`[MySkills] Failed to save skill: ${err}`);
			void vscode.window.showErrorMessage('My Skills could not save this skill.');
		} finally {
			await this._postSavedSkills();
		}
	}

	private async _postSavedSkills() {
		const skills = await getSavedSkills(this._globalStorageUri);
		this._view?.webview.postMessage({ type: 'localSkills.saved.update', skills });
	}

	private async _enableSavedSkill(message: LocalSkillEnableSavedMessage) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		const skillName = message.id;

		const choices = [
			{
				label: 'Recommended',
				description: '.agents/skills',
				detail: `Enable ${skillName} in the shared project skills folder`,
				target: 'agents' as const,
			},
			{
				label: 'Claude Code',
				description: '.claude/skills',
				detail: `Enable ${skillName} for Claude Code in this project`,
				target: 'claude' as const,
			},
		];

		const choice = await vscode.window.showQuickPick(choices, {
			title: `Enable ${skillName}`,
			placeHolder: 'Choose where to enable this skill',
		});

		if (!choice) {
			return;
		}

		try {
			await enableSavedSkill(this._globalStorageUri, workspaceFolder.uri, message.id, choice.target);
			void vscode.window.showInformationMessage(`Skill '${skillName}' enabled in ${choice.target === 'agents' ? '.agents/skills' : '.claude/skills'} ✅.`);
		} catch (err) {
			console.error(`[MySkills] Failed to enable skill: ${err}`);
			void vscode.window.showErrorMessage(`My Skills could not enable '${skillName}'. ${err instanceof Error ? err.message : ''}`);
		} finally {
			await this._postLocalSkills();
			await this._postSavedSkills();
		}
	}

	private async _deleteSavedSkill(message: LocalSkillDeleteSavedMessage) {
		const confirmed = await vscode.window.showWarningMessage(
			`Delete saved skill '${message.id}'?`,
			{ modal: true, detail: 'This will permanently remove the skill from your saved library.' },
			'Delete',
		);

		if (confirmed !== 'Delete') {
			return;
		}

		try {
			await deleteSavedSkill(this._globalStorageUri, message.id);
		} catch (err) {
			console.error(`[MySkills] Failed to delete saved skill: ${err}`);
			void vscode.window.showErrorMessage('My Skills could not delete this saved skill.');
		} finally {
			await this._postSavedSkills();
		}
	}

	private _watchWorkspaceLocalSkills() {
		this._localSkillWatchers.forEach(watcher => watcher.dispose());
		this._localSkillWatchers = [];

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return;
		}

		const refresh = () => {
			void this._postLocalSkills();
			void this._postCreateRootFileStatus();
			clearSearchRecommendationCache();
		};
		const watchedFiles = ['.gitignore', ...ROOT_SKILL_FILE_NAMES, ...ROOT_SKILL_FOLDER_WATCH_PATTERNS];

		this._localSkillWatchers = watchedFiles.map(fileName => {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, fileName));
			watcher.onDidCreate(refresh);
			watcher.onDidChange(refresh);
			watcher.onDidDelete(refresh);

			return watcher;
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview, nonce: string): string {
		const shellPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'view', 'index.html').fsPath;

		let html: string;
		try {
			html = fs.readFileSync(shellPath, 'utf8');
		} catch (err) {
			console.error(`[MySkills] Failed to read shell HTML: ${err}`);
			return this._errorHtml('Failed to load shell template');
		}

		try {
			const localPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'local-skill', 'ui', 'local.html').fsPath;
			const installPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'install.html').fsPath;
			const createPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'shell', 'shell.html').fsPath;
			const createDockPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'dock', 'chat-dock.html').fsPath;
			const createModePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'create.html').fsPath;
			const designModePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'design-md', 'design-md.html').fsPath;
			const searchModePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-search', 'search.html').fsPath;
			const namePromptPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'modal', 'skill-modal.html').fsPath;

			// ── Install sub-panels ────────────────────────────────────────
			const alltimePath  = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'alltime-skill',  'alltime.html').fsPath;
			const trendingPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'trending.html').fsPath;
			const trending24hPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', '24h', '24h.html').fsPath;
			const trendingFlamePath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'flame', 'flame.html').fsPath;
			const officialPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'official-skill', 'official.html').fsPath;
			const searchPath   = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'search-sh', 'search-sh.html').fsPath;

			let localHtml      = fs.readFileSync(localPath, 'utf8');
			let   installHtml  = fs.readFileSync(installPath, 'utf8');
			let createHtml     = fs.readFileSync(createPath, 'utf8');
			const createDockHtml = fs.readFileSync(createDockPath, 'utf8');
			const createModeHtml = fs.readFileSync(createModePath, 'utf8');
			const designModeHtml = fs.readFileSync(designModePath, 'utf8');
			const searchModeHtml = fs.readFileSync(searchModePath, 'utf8');
			const namePromptHtml = fs.readFileSync(namePromptPath, 'utf8');

			const alltimeHtml  = fs.readFileSync(alltimePath,  'utf8');
			let trendingHtml = fs.readFileSync(trendingPath, 'utf8');
			const trending24hHtml = fs.readFileSync(trending24hPath, 'utf8');
			const trendingFlameHtml = fs.readFileSync(trendingFlamePath, 'utf8');
			let officialHtml = fs.readFileSync(officialPath, 'utf8');
			const searchHtml   = fs.readFileSync(searchPath, 'utf8');

			const officialListPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'official-skill', 'list-skill', 'list.html').fsPath;
			const officialListHtml = fs.readFileSync(officialListPath, 'utf8');

			const officialImagesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'assets', 'images', 'official'));
			officialHtml = officialHtml.replace('{{OFFICIAL_IMAGES_URI}}', officialImagesUri.toString());
			officialHtml = officialHtml.replace('<!-- OFFICIAL_LIST_PANEL -->', officialListHtml);
			trendingHtml = trendingHtml.replace('<!-- TRENDING_24H_PANEL -->', trending24hHtml);
			trendingHtml = trendingHtml.replace('<!-- TRENDING_FLAME_PANEL -->', trendingFlameHtml);

			// Substitute sub-panel placeholders inside the install shell
			installHtml = installHtml.replace('<!-- ALLTIME_PANEL -->',  alltimeHtml);
			installHtml = installHtml.replace('<!-- TRENDING_PANEL -->', trendingHtml);
			installHtml = installHtml.replace('<!-- OFFICIAL_PANEL -->', officialHtml);
			installHtml = installHtml.replace('<!-- SEARCH_PANEL -->', searchHtml);
			localHtml = localHtml.replaceAll('{{LOCAL_WORKSPACE_NAME}}', escapeHtml(getWorkspaceName()));

			const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
			const createScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'create-skill.js'));
			const createLogoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'assets', 'svg', 'logo-animated.svg'));
			const globalUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'view', 'styles', 'global.css'));
			const localStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'local-skill', 'ui', 'local.css'));
			const installStyleUri  = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'install.css'));
			const trendingStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'trending-skill', 'trending.css'));
			const officialStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'panels', 'official-skill', 'official.css'));
			const searchStyleUri   = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'search-sh', 'search-sh.css'));
			const refineStyleUri   = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'install-skill', 'ui', 'refine', 'refine.css'));
			const createStyleUri   = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'shell', 'shell.css'));
			const createDockStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'dock', 'chat-dock.css'));
			const createTransitionsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'shared', 'transitions.css'));
			const createModeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'create.css'));
			const designModeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'design-md', 'design-md.css'));
			const searchModeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-search', 'search.css'));
			const namePromptStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'screens', 'create-skill', 'ui', 'chat-create', 'modal', 'skill-modal.css'));
			createHtml = createHtml.replace('<!-- CHAT_DOCK_PANEL -->', createDockHtml);
			createHtml = createHtml.replace('<!-- CREATE_MODE_PANEL -->', createModeHtml);
			createHtml = createHtml.replace('<!-- DESIGN_MODE_PANEL -->', designModeHtml);
			createHtml = createHtml.replace('<!-- SEARCH_MODE_PANEL -->', searchModeHtml);
			createHtml = createHtml.replace('<!-- NAME_PROMPT_PANEL -->', namePromptHtml);
			const createPanelHtml = createHtml.replace('{{CREATE_LOGO_URI}}', createLogoUri.toString());

			const csp = [
				`<meta http-equiv="Content-Security-Policy" content="`,
				`default-src 'none';`,
				`base-uri 'none';`,
				`form-action 'none';`,
				`object-src 'none';`,
				`style-src ${webview.cspSource};`,
				`script-src 'nonce-${nonce}';`,
				`img-src ${webview.cspSource};`,
				`font-src ${webview.cspSource};`,
				`">`,
			].join(' ');

			html = html.replace('<!-- CSP -->', csp);
			html = html.replace('<!-- STYLES -->', `<link href="${globalUri}" rel="stylesheet"><link href="${localStyleUri}" rel="stylesheet"><link href="${installStyleUri}" rel="stylesheet"><link href="${trendingStyleUri}" rel="stylesheet"><link href="${officialStyleUri}" rel="stylesheet"><link href="${searchStyleUri}" rel="stylesheet"><link href="${refineStyleUri}" rel="stylesheet"><link href="${createStyleUri}" rel="stylesheet"><link href="${createDockStyleUri}" rel="stylesheet"><link href="${createTransitionsStyleUri}" rel="stylesheet"><link href="${createModeStyleUri}" rel="stylesheet"><link href="${designModeStyleUri}" rel="stylesheet"><link href="${searchModeStyleUri}" rel="stylesheet"><link href="${namePromptStyleUri}" rel="stylesheet">`);
			html = html.replace('<!-- LOCAL_PANEL -->', localHtml);
			html = html.replace('<!-- INSTALL_PANEL -->', installHtml); // already has sub-panels injected above
			html = html.replace('<!-- CREATE_PANEL -->', createPanelHtml);
			html = html.replace('<!-- SCRIPTS -->', `<script nonce="${nonce}" src="${scriptUri}"></script><script nonce="${nonce}" src="${createScriptUri}"></script>`);

			return html;
		} catch (err) {
			console.error(`[MySkills] Failed to read screen template: ${err}`);
			return this._errorHtml('Failed to load panel templates');
		}
	}

	private _errorHtml(message: string): string {
		return `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:var(--vscode-foreground,#ccc);background:var(--vscode-editor-background,#1e1e1e);"><p>${message}</p></body></html>`;
	}

	private _openCreateSkillSupport() {
		if (this._supportPanel) {
			this._supportPanel.reveal(vscode.ViewColumn.One);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'myskills.createSupport',
			'My Skills: Support',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [this._extensionUri],
				retainContextWhenHidden: true,
			},
		);

		this._supportPanel = panel;
		panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'assets', 'svg', 'logo.svg');
		panel.webview.html = this._getCreateSkillSupportHtml(panel.webview, getNonce());
		panel.onDidDispose(() => {
			this._supportPanel = undefined;
		});
	}

	private _getCreateSkillSupportHtml(webview: vscode.Webview, nonce: string): string {
		const supportPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'tutorial', 't-skill', 'support.html').fsPath;

		let content: string;
		try {
			content = fs.readFileSync(supportPath, 'utf8');
		} catch (err) {
			console.error(`[MySkills] Failed to read create support template: ${err}`);
			return this._errorHtml('Failed to load create support');
		}

		const supportStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'tutorial', 't-skill', 'support.css'));
		const supportScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'create-skill-support.js'));
		const supportLogoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'my-skills', 'assets', 'svg', 'logo-animated.svg'));
		const authorImageUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'images', 'author.webp'));
		const p1ImageUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'images', 'tutorials', 'p1.webp'));
		const p2ImageUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'images', 'tutorials', 'p2.webp'));
		const p3ImageUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'shared', 'assets', 'images', 'tutorials', 'p3.webp'));
		const supportHtml = content
			.replace('{{CREATE_SUPPORT_LOGO_URI}}', supportLogoUri.toString())
			.replace('{{AUTHOR_IMAGE_URI}}', authorImageUri.toString())
			.replace('{{P1_IMAGE_URI}}', p1ImageUri.toString())
			.replace('{{P2_IMAGE_URI}}', p2ImageUri.toString())
			.replace('{{P3_IMAGE_URI}}', p3ImageUri.toString());
		const csp = [
			`default-src 'none';`,
			`base-uri 'none';`,
			`form-action 'none';`,
			`object-src 'none';`,
			`style-src ${webview.cspSource};`,
			`script-src 'nonce-${nonce}';`,
			`img-src ${webview.cspSource};`,
			`font-src ${webview.cspSource};`,
		].join(' ');

		return [
			'<!DOCTYPE html>',
			'<html lang="en">',
			'<head>',
			'<meta charset="UTF-8">',
			'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
			`<meta http-equiv="Content-Security-Policy" content="${csp}">`,
			'<title>My Skills: Support</title>',
			`<link href="${supportStyleUri}" rel="stylesheet">`,
			'</head>',
			'<body>',
			supportHtml,
			`<script nonce="${nonce}" src="${supportScriptUri}"></script>`,
			'</body>',
			'</html>',
		].join('');
	}

	public dispose() {
		this._view = undefined;
		this._supportPanel?.dispose();
		this._supportPanel = undefined;
		this._localSkillWatchers.forEach(watcher => watcher.dispose());
		this._localSkillWatchers = [];
	}
}

function isWebviewMessage(value: unknown): value is { type: string } {
	return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

function isLocalSkillsRequestMessage(value: unknown): value is LocalSkillsRequestMessage {
	return isWebviewMessage(value) && value.type === 'localSkills.request';
}

function isLocalSkillSetEnabledMessage(value: unknown): value is LocalSkillSetEnabledMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.setEnabled') {
		return false;
	}

	const message = value as { id?: unknown; enabled?: unknown };
	return typeof message.id === 'string' && typeof message.enabled === 'boolean';
}

function isLocalSkillDeleteMessage(value: unknown): value is LocalSkillDeleteMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.delete') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

function isLocalSkillOpenMessage(value: unknown): value is LocalSkillOpenMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.open') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

function isLocalSkillSaveMessage(value: unknown): value is LocalSkillSaveMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.save') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

function isLocalSkillsSavedRequestMessage(value: unknown): value is LocalSkillsSavedRequestMessage {
	return isWebviewMessage(value) && value.type === 'localSkills.saved.request';
}

function isLocalSkillEnableSavedMessage(value: unknown): value is LocalSkillEnableSavedMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.enableSaved') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

function isLocalSkillDeleteSavedMessage(value: unknown): value is LocalSkillDeleteSavedMessage {
	if (!isWebviewMessage(value) || value.type !== 'localSkill.deleteSaved') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

function isInstallSkillsRequestMessage(value: unknown): value is InstallSkillsRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'installSkills.request') {
		return false;
	}

	const message = value as { refresh?: unknown };
	return message.refresh === undefined || typeof message.refresh === 'boolean';
}

function isInstallSkillsMoreRequestMessage(value: unknown): value is InstallSkillsMoreRequestMessage {
	return isWebviewMessage(value) && value.type === 'installSkills.more.request';
}

function isInstallSkillsSearchRequestMessage(value: unknown): value is InstallSkillsSearchRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'installSkills.search.request') {
		return false;
	}

	const message = value as { query?: unknown; requestId?: unknown; limit?: unknown };
	return typeof message.query === 'string'
		&& typeof message.requestId === 'number'
		&& (message.limit === undefined || typeof message.limit === 'number');
}

function isCreateSkillSearchRequestMessage(value: unknown): value is CreateSkillSearchRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.search.request') {
		return false;
	}

	const message = value as { query?: unknown; requestId?: unknown; limit?: unknown };
	return typeof message.query === 'string'
		&& typeof message.requestId === 'number'
		&& (message.limit === undefined || typeof message.limit === 'number');
}

function isCreateSkillSearchPrefetchMessage(value: unknown): value is CreateSkillSearchPrefetchMessage {
	return isWebviewMessage(value) && value.type === 'createSkill.search.prefetch';
}

function isCreateSkillSearchTypingMessage(value: unknown): value is CreateSkillSearchTypingMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.search.typing') {
		return false;
	}

	const message = value as { query?: unknown };
	return typeof message.query === 'string';
}

function isCreateSkillFastNameConfirmedMessage(value: unknown): value is CreateSkillFastNameConfirmedMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.fast.nameConfirmed') {
		return false;
	}

	const message = value as { name?: unknown };
	return typeof message.name === 'string';
}

function isCreateSkillFastTechsSelectedMessage(value: unknown): value is CreateSkillFastTechsSelectedMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.fast.techsSelected') {
		return false;
	}

	const message = value as { categories?: unknown };
	return Array.isArray(message.categories) && message.categories.every(cat => typeof cat === 'string');
}

function isCreateSkillRootInstructionCreateMessage(value: unknown): value is CreateSkillRootInstructionCreateMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.rootFile.create') {
		return false;
	}

	const message = value as { fileName?: unknown };
	return isAgentsClaudeInstructionFileName(message.fileName);
}

function isCreateSkillDesignCreateMessage(value: unknown): value is CreateSkillDesignCreateMessage {
	if (!isWebviewMessage(value) || value.type !== 'createSkill.design.create') {
		return false;
	}

	const message = value as { selection?: unknown; overwrite?: unknown };
	if (!message.selection || typeof message.selection !== 'object') {
		return false;
	}

	const selection = message.selection as { colorId?: unknown; typographyId?: unknown; styleId?: unknown; skipColor?: unknown; skipTypography?: unknown; skipStyle?: unknown };
	return (selection.colorId === undefined || typeof selection.colorId === 'string')
		&& (selection.typographyId === undefined || typeof selection.typographyId === 'string')
		&& (selection.styleId === undefined || typeof selection.styleId === 'string')
		&& (selection.skipColor === undefined || typeof selection.skipColor === 'boolean')
		&& (selection.skipTypography === undefined || typeof selection.skipTypography === 'boolean')
		&& (selection.skipStyle === undefined || typeof selection.skipStyle === 'boolean')
		&& (message.overwrite === undefined || typeof message.overwrite === 'boolean');
}

function isTrending24hRequestMessage(value: unknown): value is Trending24hRequestMessage {
	return isWebviewMessage(value) && value.type === 'trending24h.request';
}

function isFlameSkillsRequestMessage(value: unknown): value is FlameSkillsRequestMessage {
	return isWebviewMessage(value) && value.type === 'flameSkills.request';
}

function isOfficialSourcesRequestMessage(value: unknown): value is OfficialSourcesRequestMessage {
	return isWebviewMessage(value) && value.type === 'officialSources.request';
}

function isOfficialSkillsRequestMessage(value: unknown): value is OfficialSkillsRequestMessage {
	if (!isWebviewMessage(value) || value.type !== 'officialSkills.request') {
		return false;
	}

	const message = value as { owner?: unknown };
	return typeof message.owner === 'string';
}

function isInstallSkillInstallMessage(value: unknown): value is InstallSkillInstallMessage {
	if (!isWebviewMessage(value) || value.type !== 'installSkill.install') {
		return false;
	}

	const message = value as { id?: unknown };
	return typeof message.id === 'string';
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function getWorkspaceName(): string {
	return vscode.workspace.name ?? vscode.workspace.workspaceFolders?.[0]?.name ?? 'Workspace';
}

function resolveDesignMdSelection(selection: CreateSkillDesignSelectionMessage): DesignMdSelection | undefined {
	const color = selection.colorId ? designColorOptions.find(option => option.id === selection.colorId) : undefined;
	const typography = selection.typographyId ? designTypographyOptions.find(option => option.id === selection.typographyId) : undefined;
	const style = selection.styleId ? designStyleOptions.find(option => option.id === selection.styleId) : undefined;

	if ((selection.colorId && !color) || (selection.typographyId && !typography) || (selection.styleId && !style)) {
		return undefined;
	}

	const skipColor = selection.skipColor === true;
	const skipTypography = selection.skipTypography === true;
	const skipStyle = selection.skipStyle === true;

	if ((color && skipColor) || (typography && skipTypography) || (style && skipStyle)) {
		return undefined;
	}

	if ((!color && !skipColor) || (!typography && !skipTypography) || (!style && !skipStyle)) {
		return undefined;
	}

	if (!color && !typography && !style) {
		return undefined;
	}

	return { color, typography, style, skipColor, skipTypography, skipStyle };
}

function ensureTrailingNewline(value: string): string {
	return value.endsWith('\n') ? value : `${value}\n`;
}

function waitForMinimumDuration(startedAt: number, minimumMs: number): Promise<void> {
	const remainingMs = Math.max(0, minimumMs - (Date.now() - startedAt));
	if (remainingMs <= 0) {
		return Promise.resolve();
	}

	return new Promise(resolve => {
		setTimeout(resolve, remainingMs);
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
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

function toCreateSkillSearchPayload(result: SearchRecommendationResult) {
	return {
		query: result.query,
		resultKind: result.resultKind,
		title: result.title,
		kicker: result.kicker,
		technologies: result.technologies.map(technology => ({
			id: technology.id,
			name: technology.name,
			categories: technology.categories,
			sources: technology.sources,
		})),
		combos: result.combos.map(combo => ({
			id: combo.id,
			name: combo.name,
			categories: combo.categories,
		})),
		categories: result.categories,
		recommendations: result.recommendations.map(recommendation => ({
			skill: recommendation.skill,
			reasons: recommendation.reasons,
			technologyIds: recommendation.technologyIds,
			score: recommendation.score,
		})),
	};
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

function isMarketplaceFolderSkillId(skillId: string): boolean {
	return skillId.startsWith('.agents/skills/') || skillId.startsWith('.claude/skills/');
}

function isCreateSkillChatTypingMessage(value: unknown): value is CreateSkillChatTypingMessage {
	return isWebviewMessage(value)
		&& value.type === 'createSkill.chat.typing'
		&& typeof (value as any).query === 'string';
}

function isCreateSkillChatCreateMessage(value: unknown): value is CreateSkillChatCreateMessage {
	return isWebviewMessage(value)
		&& value.type === 'createSkill.chat.create'
		&& typeof (value as any).name === 'string'
		&& typeof (value as any).query === 'string'
		&& ((value as any).target === 'agents' || (value as any).target === 'claude')
		&& ((value as any).template === 'base' || (value as any).template === 'fast' || (value as any).template === 'ai');
}
