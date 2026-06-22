import * as https from 'https';
import * as zlib from 'zlib';
import type { InstallMarketplaceSkill, OfficialSkillSource, RawAllTimeSkill } from './types';

const ALL_TIME_ENDPOINT = 'https://skills.sh/api/skills/all-time/0';
const ALL_TIME_PAGE_ENDPOINT = 'https://skills.sh/api/skills/all-time';
const PUBLIC_SKILLS_ENDPOINT = 'https://skills.sh/api/skills';
const PUBLIC_SEARCH_ENDPOINT = 'https://skills.sh/api/search';
const V1_SKILLS_ENDPOINT = 'https://skills.sh/api/v1/skills';
const V1_SEARCH_ENDPOINT = 'https://skills.sh/api/v1/skills/search';
const TRENDING_ENDPOINT = 'https://skills.sh/api/skills/trending';
const TRENDING_PAGE = 'https://www.skills.sh/trending';
const OFFICIAL_PAGE = 'https://www.skills.sh/official';
const OFFICIAL_CURATED_ENDPOINTS = [
	'https://skills.sh/api/v1/skills/curated',
	'https://skills.sh/api/skills/curated',
];
const REQUEST_TIMEOUT_MS = 12000;
const SOURCE_FETCH_CONCURRENCY = 6;
const DEFAULT_SKILLS_PAGE_SIZE = 200;
const MAX_SEARCH_QUERY_LENGTH = 160;
const officialSkillsCache = new Map<string, InstallMarketplaceSkill[]>();

export interface SkillPage {
	skills: InstallMarketplaceSkill[];
	page: number;
	hasMore: boolean;
	total: number | null;
}

export async function fetchAllTimeSkills(): Promise<InstallMarketplaceSkill[]> {
	return (await fetchAllTimeSkillsPage(0)).skills;
}

export async function fetchAllTimeSkillsPage(page = 0, perPage = DEFAULT_SKILLS_PAGE_SIZE): Promise<SkillPage> {
	const normalizedPage = Math.max(0, Math.floor(page));
	const normalizedPerPage = Math.min(Math.max(1, Math.floor(perPage)), 500);
	const apiKey = process.env.SKILLS_SH_API_KEY?.trim();

	if (apiKey) {
		try {
			return parseSkillPagePayload(
				await httpGetJson<unknown>(
					`${V1_SKILLS_ENDPOINT}?view=all-time&page=${normalizedPage}&per_page=${normalizedPerPage}`,
					{ Authorization: `Bearer ${apiKey}` },
				),
				normalizedPage,
				normalizedPerPage,
			);
		} catch {
			// Fall through to public endpoints so a bad or expired key does not break browsing.
		}
	}

	try {
		return parseSkillPagePayload(
			await httpGetJson<unknown>(`${ALL_TIME_PAGE_ENDPOINT}/${normalizedPage}`),
			normalizedPage,
			normalizedPerPage,
		);
	} catch {
		if (normalizedPage === 0) {
			return parseSkillPagePayload(await httpGetJson<unknown>(ALL_TIME_ENDPOINT), normalizedPage, normalizedPerPage);
		}
	}

	return parseSkillPagePayload(
		await httpGetJson<unknown>(
			`${PUBLIC_SKILLS_ENDPOINT}?view=all-time&page=${normalizedPage}&per_page=${normalizedPerPage}`,
		),
		normalizedPage,
		normalizedPerPage,
	);
}

export async function searchMarketplaceSkills(query: string, limit = 120): Promise<InstallMarketplaceSkill[]> {
	const normalizedQuery = normalizeSearchQuery(query);
	if (normalizedQuery.length < 2) {
		return [];
	}

	const normalizedLimit = Math.min(Math.max(1, Math.floor(limit)), 200);
	const apiKey = process.env.SKILLS_SH_API_KEY?.trim();
	const encodedQuery = encodeURIComponent(normalizedQuery);

	if (apiKey) {
		try {
			return normalizeRawSkills(
				extractRawSkills(await httpGetJson<unknown>(
					`${V1_SEARCH_ENDPOINT}?q=${encodedQuery}&limit=${normalizedLimit}`,
					{ Authorization: `Bearer ${apiKey}` },
				)),
			);
		} catch {
			// Public search keeps the extension useful without requiring every user to configure a key.
		}
	}

	try {
		return normalizeRawSkills(
			extractRawSkills(await httpGetJson<unknown>(`${PUBLIC_SEARCH_ENDPOINT}?q=${encodedQuery}&limit=${normalizedLimit}`)),
		);
	} catch {
		// Some deployments expose only the public leaderboard endpoint. Use it as a narrow fallback.
	}

	const payload = await httpGetJson<unknown>(`${PUBLIC_SKILLS_ENDPOINT}?q=${encodedQuery}&limit=${normalizedLimit}`);
	return rankLocalMatches(normalizeRawSkills(extractRawSkills(payload)), normalizedQuery).slice(0, normalizedLimit);
}

export async function fetchTrending24hSkills(): Promise<InstallMarketplaceSkill[]> {
	try {
		const payload = await httpGetJson<RawAllTimeSkill[] | { skills: RawAllTimeSkill[] }>(TRENDING_ENDPOINT);
		const rawSkills = Array.isArray(payload) ? payload : payload.skills;
		const skills = normalizeRawSkills(rawSkills);
		if (skills.length > 0) {
			return skills;
		}
	} catch {
		// The public API shape is less stable than the page, so the page parser is the fallback.
	}

	return parseTrendingHtml(await httpGet(TRENDING_PAGE, 'text/html,application/xhtml+xml'));
}

export async function fetchOfficialSkillSources(): Promise<OfficialSkillSource[]> {
	const curatedSources = await tryFetchCuratedOfficialSources();
	if (curatedSources.length > 0) {
		return curatedSources;
	}

	return parseOfficialSourcesHtml(await httpGet(OFFICIAL_PAGE, 'text/html,application/xhtml+xml'));
}

export async function fetchOfficialSkillsForOwner(owner: string): Promise<InstallMarketplaceSkill[]> {
	const normalizedOwner = owner.trim().toLowerCase();
	const cachedSkills = officialSkillsCache.get(normalizedOwner);
	if (cachedSkills) {
		return cachedSkills;
	}

	const page = await httpGet(`https://skills.sh/${encodeURIComponent(normalizedOwner)}`, 'text/html,application/xhtml+xml');
	const sources = parseOwnerSourceLinks(page, normalizedOwner);
	if (sources.length === 0) {
		return [];
	}

	const fetched = await mapWithConcurrency(sources, SOURCE_FETCH_CONCURRENCY, async source => {
		try {
			const sourcePage = await httpGet(`https://skills.sh/${source}`, 'text/html,application/xhtml+xml');
			return parseSourceSkillsHtml(sourcePage, source);
		} catch {
			return [];
		}
	});

	const seen = new Set<string>();
	const skills = fetched
		.flat()
		.filter(skill => {
			if (seen.has(skill.id)) {
				return false;
			}
			seen.add(skill.id);
			return true;
		})
		.sort((a, b) => b.installs - a.installs);

	officialSkillsCache.set(normalizedOwner, skills);
	return skills;
}

export async function fetchFlameSkills(
	source: { owner: string; repo: string; path: string; ref: string },
): Promise<InstallMarketplaceSkill[]> {
	const owner = source.owner.trim();
	const repo = source.repo.trim().replace(/\.git$/i, '');
	if (!owner || !repo) {
		return [];
	}

	const ref = source.ref.trim() || 'main';
	const contentsPath = source.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
	const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${contentsPath}?ref=${encodeURIComponent(ref)}`;

	const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
	const githubToken = process.env.GITHUB_TOKEN?.trim();
	if (githubToken) {
		headers.Authorization = `Bearer ${githubToken}`;
	}

	const payload = await httpGetJson<unknown>(apiUrl, headers);
	if (!Array.isArray(payload)) {
		return [];
	}

	const sourceSlug = `${owner}/${repo}`;
	const seen = new Set<string>();
	const skills: InstallMarketplaceSkill[] = [];

	for (const entry of payload) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}

		const { name, type } = entry as { name?: unknown; type?: unknown };
		if (type !== 'dir' || typeof name !== 'string' || !name.trim()) {
			continue;
		}

		const skill = createManualGithubSkill({ source: sourceSlug, skillId: name.trim() });
		if (seen.has(skill.id)) {
			continue;
		}

		seen.add(skill.id);
		skills.push(skill);
	}

	return skills;
}

export function createSkillsFromGithubSkillUrls(urls: readonly string[]): InstallMarketplaceSkill[] {
	const entries = urls
		.map(parseGithubSkillUrl)
		.filter((entry): entry is GithubSkillEntry => entry !== undefined);

	if (entries.length === 0) {
		return [];
	}

	const seen = new Set<string>();
	const skills: InstallMarketplaceSkill[] = [];

	for (const entry of entries) {
		const skill = createManualGithubSkill(entry);
		if (seen.has(skill.id)) {
			continue;
		}

		skills.push(skill);
		seen.add(skill.id);
	}

	return skills;
}

interface CuratedOfficialPayload {
	data?: unknown;
}

interface CuratedOwner {
	owner?: unknown;
	totalInstalls?: unknown;
	featuredRepo?: unknown;
	skills?: unknown;
}

interface CuratedSkill {
	id?: unknown;
	slug?: unknown;
	name?: unknown;
	source?: unknown;
	installs?: unknown;
}

interface GithubSkillEntry {
	source: string;
	skillId: string;
}

interface SkillPagePayload {
	skills?: unknown;
	data?: unknown;
	hasMore?: unknown;
	total?: unknown;
	count?: unknown;
	pagination?: {
		page?: unknown;
		perPage?: unknown;
		total?: unknown;
		hasMore?: unknown;
	};
}

interface RawMarketplaceSkill extends Partial<RawAllTimeSkill> {
	slug?: unknown;
	topSource?: unknown;
	sourceType?: unknown;
	installUrl?: unknown;
	url?: unknown;
}

async function tryFetchCuratedOfficialSources(): Promise<OfficialSkillSource[]> {
	for (const endpoint of OFFICIAL_CURATED_ENDPOINTS) {
		try {
			const payload = await httpGetJson<CuratedOfficialPayload>(endpoint);
			const sources = normalizeCuratedOfficialPayload(payload);
			if (sources.length > 0) {
				return sources;
			}
		} catch {
			// The documented v1 endpoint requires an API key; the public page parser is the fallback.
		}
	}

	return [];
}

function normalizeCuratedOfficialPayload(payload: CuratedOfficialPayload): OfficialSkillSource[] {
	if (!Array.isArray(payload.data)) {
		return [];
	}

	const sources: OfficialSkillSource[] = [];
	for (const value of payload.data) {
		if (!value || typeof value !== 'object') {
			continue;
		}

		const ownerEntry = value as CuratedOwner;
		if (typeof ownerEntry.owner !== 'string' || !Array.isArray(ownerEntry.skills)) {
			continue;
		}

		const owner = ownerEntry.owner.toLowerCase();
		const skills = normalizeCuratedSkills(ownerEntry.skills);
		if (skills.length === 0) {
			continue;
		}

		officialSkillsCache.set(owner, skills);
		sources.push({
			id: owner,
			owner,
			displayName: formatOwnerName(owner),
			featuredRepo: typeof ownerEntry.featuredRepo === 'string' ? ownerEntry.featuredRepo : skills[0].source.split('/').at(1) ?? 'skills',
			repoCount: new Set(skills.map(skill => skill.source)).size,
			skillCount: skills.length,
			totalInstalls: typeof ownerEntry.totalInstalls === 'number' ? ownerEntry.totalInstalls : skills.reduce((total, skill) => total + skill.installs, 0),
		});
	}

	return sources.sort((a, b) => b.skillCount - a.skillCount);
}

function normalizeCuratedSkills(rawSkills: unknown[]): InstallMarketplaceSkill[] {
	return rawSkills
		.filter((skill): skill is CuratedSkill => Boolean(skill) && typeof skill === 'object')
		.map(skill => {
			const source = typeof skill.source === 'string' ? skill.source : '';
			const slug = typeof skill.slug === 'string' ? skill.slug : parseSkillIdFromPath(typeof skill.id === 'string' ? skill.id : '');
			const name = typeof skill.name === 'string' ? skill.name : slug;
			const id = typeof skill.id === 'string' ? skill.id : source && slug ? `${source}/${slug}` : '';
			return {
				id,
				skillId: slug,
				name,
				source,
				installs: typeof skill.installs === 'number' ? skill.installs : 0,
			};
		})
		.filter(skill => skill.id && skill.skillId && skill.source);
}

function parseSkillPagePayload(payload: unknown, fallbackPage: number, perPage: number): SkillPage {
	const rawSkills = extractRawSkills(payload);
	const skills = normalizeRawSkills(rawSkills);
	const pagePayload = isSkillPagePayload(payload) ? payload : undefined;
	const pagination = pagePayload?.pagination;
	const page = typeof pagination?.page === 'number' ? pagination.page : fallbackPage;
	const total = typeof pagination?.total === 'number'
		? pagination.total
		: typeof pagePayload?.total === 'number'
			? pagePayload.total
			: typeof pagePayload?.count === 'number'
				? pagePayload.count
				: null;
	const explicitHasMore = typeof pagination?.hasMore === 'boolean'
		? pagination.hasMore
		: typeof pagePayload?.hasMore === 'boolean'
			? pagePayload.hasMore
			: undefined;

	return {
		skills,
		page,
		hasMore: explicitHasMore ?? skills.length >= perPage,
		total,
	};
}

function extractRawSkills(payload: unknown): unknown {
	if (Array.isArray(payload)) {
		return payload;
	}

	if (!isSkillPagePayload(payload)) {
		return [];
	}

	if (Array.isArray(payload.data)) {
		return payload.data;
	}

	if (Array.isArray(payload.skills)) {
		return payload.skills;
	}

	return [];
}

function isSkillPagePayload(payload: unknown): payload is SkillPagePayload {
	return Boolean(payload) && typeof payload === 'object';
}

function parseOfficialSourcesHtml(html: string): OfficialSkillSource[] {
	const sources: OfficialSkillSource[] = [];
	const seen = new Set<string>();
	const linkPattern = /<a[^>]*href="(?:https:\/\/(?:www\.)?skills\.sh)?\/([^/"?#]+)"[^>]*>([\s\S]*?)<\/a>/g;
	let match: RegExpExecArray | null;

	while ((match = linkPattern.exec(html)) !== null) {
		const owner = decodeURIComponent(match[1]).toLowerCase();
		const text = textFromHtml(match[2]);
		const parts = text.split(/\s+/g).filter(Boolean);
		const repoCount = Number.parseInt(parts.at(-2) ?? '', 10);
		const skillCount = Number.parseInt(parts.at(-1) ?? '', 10);
		const featuredRepo = parts.at(1) ?? 'skills';

		if (!owner || seen.has(owner) || !Number.isFinite(repoCount) || !Number.isFinite(skillCount)) {
			continue;
		}

		seen.add(owner);
		sources.push({
			id: owner,
			owner,
			displayName: formatOwnerName(owner),
			featuredRepo,
			repoCount,
			skillCount,
			totalInstalls: null,
		});
	}

	return sources.sort((a, b) => b.skillCount - a.skillCount);
}

function parseOwnerSourceLinks(html: string, owner: string): string[] {
	const sources: string[] = [];
	const seen = new Set<string>();
	const linkPattern = /<a[^>]*href="(?:https:\/\/(?:www\.)?skills\.sh)?\/([^/"?#]+)\/([^/"?#]+)"[^>]*>([\s\S]*?)<\/a>/g;
	let match: RegExpExecArray | null;

	while ((match = linkPattern.exec(html)) !== null) {
		const linkOwner = decodeURIComponent(match[1]).toLowerCase();
		const repo = decodeURIComponent(match[2]);
		const text = textFromHtml(match[3]);
		if (linkOwner !== owner || !repo || !/\d+\s+skills?\s*:/.test(text)) {
			continue;
		}

		const source = `${linkOwner}/${repo}`;
		if (seen.has(source)) {
			continue;
		}

		seen.add(source);
		sources.push(source);
	}

	return sources;
}

function parseSourceSkillsHtml(html: string, source: string): InstallMarketplaceSkill[] {
	const skills: InstallMarketplaceSkill[] = [];
	const seen = new Set<string>();
	const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const linkPattern = new RegExp(`<a[^>]*href="(?:https:\\/\\/(?:www\\.)?skills\\.sh)?\\/${escapedSource}\\/([^/"?#]+)"[^>]*>([\\s\\S]*?)<\\/a>`, 'g');
	let match: RegExpExecArray | null;

	while ((match = linkPattern.exec(html)) !== null) {
		const skillId = decodeURIComponent(match[1]);
		const text = textFromHtml(match[2]);
		const installMatch = text.match(/(.+?)\s+([0-9,.]+[KM]?)$/i);
		const name = installMatch ? installMatch[1].trim() : skillId;
		const installs = installMatch ? parseInstallCount(installMatch[2]) : 0;
		const id = `${source}/${skillId}`;

		if (!skillId || !name || seen.has(id)) {
			continue;
		}

		seen.add(id);
		skills.push({
			id,
			skillId,
			name,
			source,
			installs,
		});
	}

	return skills;
}

function normalizeRawSkills(rawSkills: unknown): InstallMarketplaceSkill[] {
	if (!Array.isArray(rawSkills)) {
		return [];
	}

	return rawSkills
		.filter((skill): skill is RawMarketplaceSkill => isRawSkill(skill))
		.map(skill => {
			const source = sourceFromRawSkill(skill);
			const skillId = skillIdFromRawSkill(skill);
			const name = typeof skill.name === 'string' && skill.name.trim() ? skill.name.trim() : skillId;
			return {
				id: source && skillId ? `${source}/${skillId}` : typeof skill.id === 'string' ? skill.id : skillId,
				skillId,
				name,
				installs: typeof skill.installs === 'number' ? skill.installs : 0,
				source,
			};
		})
		.filter(skill => skill.skillId !== 'find-skills' && skill.name !== 'find-skills')
		.filter(skill => skill.id && skill.skillId && skill.name && skill.source);
}

function isRawSkill(value: unknown): value is RawMarketplaceSkill {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const skill = value as RawMarketplaceSkill;
	return typeof skill.name === 'string'
		&& typeof skill.installs === 'number'
		&& skillIdFromRawSkill(skill) !== ''
		&& sourceFromRawSkill(skill) !== '';
}

function sourceFromRawSkill(skill: RawMarketplaceSkill): string {
	if (typeof skill.source === 'string' && skill.source.trim()) {
		return skill.source.trim();
	}

	if (typeof skill.topSource === 'string' && skill.topSource.trim()) {
		return skill.topSource.trim();
	}

	if (typeof skill.id === 'string') {
		const parts = skill.id.split('/').filter(Boolean);
		if (parts.length >= 3) {
			return parts.slice(0, -1).join('/');
		}
	}

	return '';
}

function skillIdFromRawSkill(skill: RawMarketplaceSkill): string {
	if (typeof skill.skillId === 'string' && skill.skillId.trim()) {
		return skill.skillId.trim();
	}

	if (typeof skill.slug === 'string' && skill.slug.trim()) {
		return skill.slug.trim();
	}

	if (typeof skill.id === 'string' && skill.id.includes('/')) {
		return parseSkillIdFromPath(skill.id);
	}

	if (typeof skill.id === 'string' && skill.id.trim()) {
		return skill.id.trim();
	}

	return '';
}

function normalizeSearchQuery(query: string): string {
	return query
		.normalize('NFKC')
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_SEARCH_QUERY_LENGTH);
}

function rankLocalMatches(skills: InstallMarketplaceSkill[], query: string): InstallMarketplaceSkill[] {
	const terms = query.toLowerCase().split(/\s+/g).filter(Boolean);
	return skills
		.map(skill => ({ skill, score: scoreSkill(skill, terms) }))
		.filter(entry => entry.score > 0)
		.sort((a, b) => b.score - a.score || b.skill.installs - a.skill.installs)
		.map(entry => entry.skill);
}

function scoreSkill(skill: InstallMarketplaceSkill, terms: string[]): number {
	const name = skill.name.toLowerCase();
	const skillId = skill.skillId.toLowerCase();
	const source = skill.source.toLowerCase();
	let score = 0;

	for (const term of terms) {
		if (name === term || skillId === term) {
			score += 80;
		} else if (name.startsWith(term) || skillId.startsWith(term)) {
			score += 48;
		} else if (name.includes(term) || skillId.includes(term)) {
			score += 28;
		} else if (source.includes(term)) {
			score += 14;
		}
	}

	return score;
}

function parseTrendingHtml(html: string): InstallMarketplaceSkill[] {
	const skills: InstallMarketplaceSkill[] = [];
	const seen = new Set<string>();
	const linkPattern = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p[^>]*>([^<]+)<\/p>[\s\S]*?([0-9,.]+[KM]?)\s*<\/[^>]*>[\s\S]*?<\/a>/g;
	let match: RegExpExecArray | null;

	while ((match = linkPattern.exec(html)) !== null) {
		const name = decodeHtml(match[2].trim());
		const source = decodeHtml(match[3].trim());
		if (!name || name === 'find-skills' || !source) {
			continue;
		}

		const id = `${source}/${name}`;
		if (seen.has(id)) {
			continue;
		}

		seen.add(id);
		skills.push({
			id,
			skillId: name,
			name,
			source,
			installs: parseInstallCount(match[4]),
		});
	}

	if (skills.length > 0) {
		return skills;
	}

	const urlPattern = /https:\/\/(?:www\.)?skills\.sh\/([^/\s"')]+)\/([^/\s"')]+)\/([^/\s"')]+)/g;
	while ((match = urlPattern.exec(html)) !== null) {
		const owner = decodeURIComponent(match[1]);
		const repo = decodeURIComponent(match[2]);
		const name = decodeURIComponent(match[3]);
		if (!owner || !repo || !name || name === 'find-skills') {
			continue;
		}

		const source = `${owner}/${repo}`;
		const id = `${source}/${name}`;
		if (seen.has(id)) {
			continue;
		}

		seen.add(id);
		skills.push({
			id,
			skillId: name,
			name,
			source,
			installs: 0,
		});
	}

	return skills;
}

function parseGithubSkillUrl(value: string): GithubSkillEntry | undefined {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
			return undefined;
		}

		const parts = url.pathname.split('/').filter(Boolean);
		const [owner, repo] = parts;
		if (!owner || !repo) {
			return undefined;
		}

		const blobIndex = parts.indexOf('blob');
		const filePath = blobIndex >= 0 ? parts.slice(blobIndex + 2) : parts.slice(2);
		if (filePath.at(-1)?.toLowerCase() !== 'skill.md') {
			return undefined;
		}

		const parentFolder = filePath.at(-2);
		const skillId = parentFolder && parentFolder !== repo ? parentFolder : repo;

		return {
			source: `${owner}/${repo.replace(/\.git$/i, '')}`,
			skillId,
		};
	} catch {
		return undefined;
	}
}

function createManualGithubSkill(entry: GithubSkillEntry): InstallMarketplaceSkill {
	return {
		id: `${entry.source}/${entry.skillId}`,
		skillId: entry.skillId,
		name: entry.skillId,
		installs: 0,
		source: entry.source,
	};
}

function parseInstallCount(value: string): number {
	const normalized = value.trim().replace(/,/g, '').toUpperCase();
	const numberValue = Number.parseFloat(normalized);
	if (!Number.isFinite(numberValue)) {
		return 0;
	}

	if (normalized.endsWith('M')) {
		return Math.round(numberValue * 1000000);
	}

	if (normalized.endsWith('K')) {
		return Math.round(numberValue * 1000);
	}

	return Math.round(numberValue);
}

function parseSkillIdFromPath(value: string): string {
	return value.split('/').filter(Boolean).at(-1) ?? '';
}

function formatOwnerName(owner: string): string {
	return owner
		.split(/[-_.]/g)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function textFromHtml(value: string): string {
	return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

async function mapWithConcurrency<T, R>(
	values: T[],
	concurrency: number,
	mapper: (value: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = [];
	let index = 0;

	async function worker() {
		while (index < values.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await mapper(values[currentIndex]);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
	return results;
}

function httpGetJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
	return httpGet(url, 'application/json', headers).then(response => JSON.parse(response) as T);
}

function httpGet(url: string, accept: string, headers: Record<string, string> = {}, redirectCount = 0): Promise<string> {
	return new Promise((resolve, reject) => {
		const request = https.get(
			url,
			{
				headers: {
					'User-Agent': 'MySkillsExtension/0.1',
					Accept: accept,
					'Accept-Encoding': 'gzip, deflate, br',
					...headers,
				},
				timeout: REQUEST_TIMEOUT_MS,
			},
			response => {
				if (
					response.statusCode
					&& response.statusCode >= 300
					&& response.statusCode < 400
					&& response.headers.location
				) {
					const redirectUrl = resolveAllowedRedirectUrl(url, response.headers.location);
					response.resume();
					if (!redirectUrl) {
						reject(new Error('Blocked unsafe redirect'));
						return;
					}
					if (redirectCount >= 5) {
						reject(new Error('Too many redirects'));
						return;
					}

					httpGet(redirectUrl, accept, headers, redirectCount + 1).then(resolve).catch(reject);
					return;
				}

				if (response.statusCode && response.statusCode !== 200) {
					reject(new Error(`HTTP ${response.statusCode}`));
					return;
				}

				const encoding = String(response.headers['content-encoding'] ?? '').toLowerCase();
				let stream: NodeJS.ReadableStream = response;

				if (encoding.includes('gzip')) {
					stream = response.pipe(zlib.createGunzip());
				} else if (encoding.includes('br')) {
					stream = response.pipe(zlib.createBrotliDecompress());
				} else if (encoding.includes('deflate')) {
					stream = response.pipe(zlib.createInflate());
				}

				let data = '';
				stream.on('data', chunk => {
					data += chunk.toString();
				});
				stream.on('end', () => resolve(data));
				stream.on('error', reject);
			},
		);

		request.on('timeout', () => {
			request.destroy(new Error('Request timed out'));
		});
		request.on('error', reject);
	});
}

function resolveAllowedRedirectUrl(currentUrl: string, location: string): string | undefined {
	try {
		const current = new URL(currentUrl);
		const next = new URL(location, current);
		if (next.protocol !== 'https:' || !isAllowedRedirectHost(current.hostname, next.hostname)) {
			return undefined;
		}

		return next.toString();
	} catch {
		return undefined;
	}
}

function isAllowedRedirectHost(currentHost: string, nextHost: string): boolean {
	if (nextHost === currentHost) {
		return true;
	}

	const skillsHosts = new Set(['skills.sh', 'www.skills.sh']);
	return skillsHosts.has(currentHost) && skillsHosts.has(nextHost);
}
