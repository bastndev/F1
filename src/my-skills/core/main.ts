import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { httpGet } from './https';
import { FLAME_SKILL_REPO_URL } from '../screens/install-skill/ui/panels/trending-skill/flame/data/flame-skills';
import { InstallSkillsController } from './install-skills-controller';
import { ROOT_SKILL_FILE_NAMES, ROOT_SKILL_FOLDER_WATCH_PATTERNS, deleteWorkspaceRootSkill, getWorkspaceRootSkills, setWorkspaceRootSkillEnabled } from '../screens/local-skill/core/local-skills';
import { deleteSavedSkill, enableSavedSkill, getSavedSkills, isSavedSkillInWorkspace, saveSkill } from '../screens/local-skill/core/saved-skills';
import type { FlameSkillDetailMessage } from '../screens/install-skill/core/types';
import type { LocalSkillDeleteMessage, LocalSkillDeleteSavedMessage, LocalSkillEnableSavedMessage, LocalSkillOpenMessage, LocalSkillSaveMessage, LocalSkillSetEnabledMessage } from '../screens/local-skill/core/types';
import { clearSearchRecommendationCache, getSearchRecommendationPreview, getSearchRecommendations, prewarmSearchRecommendations, type SearchRecommendationResult } from '../screens/create-skill/core/chat-search-core';
import { createAgentsClaudeInstructionMarkdown, type AgentsClaudeInstructionFileName } from '../screens/create-skill/core/agents-claude-md';

import { createDesignMdMarkdown } from '../screens/create-skill/ui/chat-create/design-md/core/markdown';
import type { DesignMdSelection } from '../screens/create-skill/ui/chat-create/design-md/core/types';
import { designColorOptions } from '../screens/create-skill/ui/chat-create/design-md/data/colors';
import { designStyleOptions } from '../screens/create-skill/ui/chat-create/design-md/data/styles';
import { designTypographyOptions } from '../screens/create-skill/ui/chat-create/design-md/data/typography';
import { createSkillBoilerplate } from '../screens/create-skill/core/chat-create-core/skill-generator';
import { translateQuery } from '../screens/create-skill/core/shared/project-translation';
import { resetFastContext, updateFastDescription, updateFastName, updateFastTechnologies, waitForPendingBackgroundFetches } from '../screens/create-skill/core/chat-create-core/fast-context-manager';
import { getNonce, getWorkspaceName, getSkillsWebviewHtml, getCreateSkillSupportHtml } from './skills-webview-html';
import {
	isWebviewMessage,
	isLocalSkillsRequestMessage,
	isLocalSkillSetEnabledMessage,
	isLocalSkillDeleteMessage,
	isLocalSkillOpenMessage,
	isLocalSkillSaveMessage,
	isLocalSkillsSavedRequestMessage,
	isLocalSkillEnableSavedMessage,
	isLocalSkillDeleteSavedMessage,
	isInstallSkillsRequestMessage,
	isInstallSkillsMoreRequestMessage,
	isInstallSkillsSearchRequestMessage,
	isCreateSkillSearchRequestMessage,
	isCreateSkillSearchPrefetchMessage,
	isCreateSkillSearchTypingMessage,
	isCreateSkillFastNameConfirmedMessage,
	isCreateSkillFastTechsSelectedMessage,
	isCreateSkillRootInstructionCreateMessage,
	isCreateSkillDesignCreateMessage,
	isTrending24hRequestMessage,
	isFlameSkillsRequestMessage,
	isFlameSkillOpenRepoMessage,
	isFlameSkillDetailMessage,
	isOfficialSourcesRequestMessage,
	isOfficialSkillsRequestMessage,
	isInstallSkillInstallMessage,
	isInstallSkillCancelMessage,
	isCreateSkillChatCreateMessage,
	type CreateSkillSearchRequestMessage,
	type CreateSkillRootInstructionCreateMessage,
	type CreateSkillDesignCreateMessage,
	type CreateSkillChatCreateMessage,
	type CreateSkillDesignSelectionMessage,
} from './messages';

const CREATE_ROOT_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md', 'DESIGN.md'] as const;
const CREATE_ROOT_INSTRUCTION_MINIMUM_LOADING_MS = 1200;

type CreateSkillDesignStatus = 'writing' | 'created' | 'error';
type CreateSkillRootInstructionStatus = 'writing' | 'created' | 'error';

export class MySkillsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'myskills-panel';
	private _view?: vscode.WebviewView;
	private _supportPanel?: vscode.WebviewPanel;
	private _localSkillWatchers: vscode.FileSystemWatcher[] = [];
	private readonly _onDidSkillsChange = new vscode.EventEmitter<void>();
	public readonly onDidSkillsChange = this._onDidSkillsChange.event;
	private readonly _install = new InstallSkillsController({
		hasView: () => this._view !== undefined,
		postMessage: message => this._view?.webview.postMessage(message),
		onSkillInstalled: async () => {
			await this._postLocalSkills();
			this._onDidSkillsChange.fire();
			clearSearchRecommendationCache();
			await this._postCreateDesignReturnToLocal();
		},
	});

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
				void this._install.postInstallSkills(message.refresh ?? true);
			}
			if (isInstallSkillsMoreRequestMessage(message)) {
				void this._install.postMoreInstallSkills();
			}
			if (isInstallSkillsSearchRequestMessage(message)) {
				void this._install.postSearchSkills(message);
			}
			if (isTrending24hRequestMessage(message)) {
				void this._install.postTrending24hSkills(true);
			}
			if (isFlameSkillsRequestMessage(message)) {
				void this._install.postFlameSkills(true);
			}
			if (isFlameSkillOpenRepoMessage(message)) {
				void vscode.env.openExternal(vscode.Uri.parse(FLAME_SKILL_REPO_URL));
			}
			if (isFlameSkillDetailMessage(message)) {
				void this._openFlameSkillReadme(message);
			}
			if (isOfficialSourcesRequestMessage(message)) {
				void this._install.postOfficialSources(true);
			}
			if (isOfficialSkillsRequestMessage(message)) {
				void this._install.postOfficialSkills(message.owner, true);
			}
			if (isInstallSkillInstallMessage(message)) {
				void this._install.installSkill(message);
			}
			if (isInstallSkillCancelMessage(message)) {
				void this._install.cancelInstallSkill(message);
			}
		});

		webviewView.webview.html = getSkillsWebviewHtml(webviewView.webview, this._extensionUri, nonce);
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
			await vscode.window.showErrorMessage(vscode.l10n.t('Open a workspace first to create a skill.'));
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
			this._onDidSkillsChange.fire();
			await this._postCreateSkillResult(true, 'Skill created');
		} catch (err) {
			console.error(`[MySkills] Failed to create chat skill: ${err}`);
			await this._postCreateSkillResult(false, 'Failed to create skill. Check output logs.');
			await vscode.window.showErrorMessage(vscode.l10n.t('Failed to create skill. Check output logs.'));
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
			this._install.setCreateSearchSkills(result.recommendations.map(recommendation => recommendation.skill));

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

	private async _setLocalSkillEnabled(message: LocalSkillSetEnabledMessage) {
		try {
			await setWorkspaceRootSkillEnabled(message.id, message.enabled);
		} catch (err) {
			console.error(`[MySkills] Failed to update .gitignore: ${err}`);
			void vscode.window.showErrorMessage(vscode.l10n.t('My Skills could not update .gitignore.'));
		} finally {
			await this._postLocalSkills();
			this._onDidSkillsChange.fire();
		}
	}

	private async _deleteLocalSkill(message: LocalSkillDeleteMessage) {
		const confirmed = await vscode.window.showWarningMessage(
			vscode.l10n.t('Delete {0}?', message.id),
			{ modal: true, detail: vscode.l10n.t('The item will be moved to the trash when possible.') },
			'Delete',
		);

		if (confirmed !== 'Delete') {
			return;
		}

		try {
			await deleteWorkspaceRootSkill(message.id);
		} catch (err) {
			console.error(`[MySkills] Failed to delete local skill: ${err}`);
			void vscode.window.showErrorMessage(vscode.l10n.t('My Skills could not delete this item.'));
		} finally {
			await this._postLocalSkills();
			this._onDidSkillsChange.fire();
			if (isMarketplaceFolderSkillId(message.id)) {
				await this._install.postInstallSkills(true);
				await this._install.postTrending24hSkills(true);
				await this._install.postFlameSkills(true);
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
			void vscode.window.showErrorMessage(vscode.l10n.t('My Skills could not open this skill.'));
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
			void vscode.window.showInformationMessage(vscode.l10n.t("Skill '{0}' saved successfully ✅.", skillName));
		} catch (err) {
			console.error(`[MySkills] Failed to save skill: ${err}`);
			void vscode.window.showErrorMessage(vscode.l10n.t('My Skills could not save this skill.'));
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
			void vscode.window.showInformationMessage(vscode.l10n.t("Skill '{0}' enabled in {1} ✅.", skillName, choice.target === 'agents' ? '.agents/skills' : '.claude/skills'));
		} catch (err) {
			console.error(`[MySkills] Failed to enable skill: ${err}`);
			void vscode.window.showErrorMessage(vscode.l10n.t("My Skills could not enable '{0}'. {1}", skillName, err instanceof Error ? err.message : ''));
		} finally {
			await this._postLocalSkills();
			await this._postSavedSkills();
		}
	}

	private async _deleteSavedSkill(message: LocalSkillDeleteSavedMessage) {
		const confirmed = await vscode.window.showWarningMessage(
			vscode.l10n.t("Delete saved skill '{0}'?", message.id),
			{ modal: true, detail: vscode.l10n.t('This will permanently remove the skill from your saved library.') },
			'Delete',
		);

		if (confirmed !== 'Delete') {
			return;
		}

		try {
			await deleteSavedSkill(this._globalStorageUri, message.id);
		} catch (err) {
			console.error(`[MySkills] Failed to delete saved skill: ${err}`);
			void vscode.window.showErrorMessage(vscode.l10n.t('My Skills could not delete this saved skill.'));
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

	private async _openFlameSkillReadme(message: FlameSkillDetailMessage) {
		if (message.source !== 'bastndev/skills') {
			void vscode.env.openExternal(vscode.Uri.parse(FLAME_SKILL_REPO_URL));
			return;
		}

		const readmeUrl = `https://raw.githubusercontent.com/bastndev/skills/main/skills/${encodeURIComponent(message.skillId)}/README.md`;

		let rawContent: string;
		try {
			rawContent = await httpGet(readmeUrl, 'text/plain, */*');
		} catch {
			void vscode.env.openExternal(vscode.Uri.parse(FLAME_SKILL_REPO_URL));
			return;
		}

		try {
			const tempFile = vscode.Uri.file(path.join(os.tmpdir(), `bastndev-${message.skillId}-README.md`));
			await vscode.workspace.fs.writeFile(tempFile, Buffer.from(rawContent, 'utf8'));
			await vscode.commands.executeCommand('markdown.showPreview', tempFile);
		} catch (err) {
			console.error(`[MySkills] Failed to open README: ${err}`);
			void vscode.env.openExternal(vscode.Uri.parse(FLAME_SKILL_REPO_URL));
		}
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
		panel.webview.html = getCreateSkillSupportHtml(panel.webview, this._extensionUri, getNonce());
		panel.onDidDispose(() => {
			this._supportPanel = undefined;
		});
	}

	public dispose() {
		this._view = undefined;
		this._supportPanel?.dispose();
		this._supportPanel = undefined;

		this._localSkillWatchers.forEach(watcher => watcher.dispose());
		this._localSkillWatchers = [];
		this._onDidSkillsChange.dispose();
	}
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

function isMarketplaceFolderSkillId(skillId: string): boolean {
	return skillId.startsWith('.agents/skills/') || skillId.startsWith('.claude/skills/');
}

