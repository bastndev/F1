import type { ProjectCategory } from '../types';
import type { QueryIntentId } from './query-intents';

export interface CuratedSkillRule {
	skill: string;
	reason: string;
	score: number;
	estimatedInstalls?: number;
	intentIds?: QueryIntentId[];
	categories?: ProjectCategory[];
	technologyIds?: string[];
}

export const STACK_BONUS_SKILLS: CuratedSkillRule[] = [
	{
		skill: 'vercel-labs/agent-skills/accessibility',
		reason: 'Detected web project',
		score: 56,
		estimatedInstalls: 800,
		categories: ['web'],
	},
	{
		skill: 'sleekdotdesign/agent-skills/design-review',
		reason: 'Detected web project',
		score: 56,
		estimatedInstalls: 1500,
		categories: ['web'],
	},
];

export const INTENT_SKILL_RULES: CuratedSkillRule[] = [
	{
		skill: 'vercel-labs/agent-skills/deploy-to-vercel',
		reason: 'Production deployment request',
		score: 150,
		estimatedInstalls: 9200,
		intentIds: ['deployment'],
		categories: ['web', 'backend', 'infra'],
	},
	{
		skill: 'cloudflare/skills/cloudflare',
		reason: 'Production deployment request',
		score: 132,
		estimatedInstalls: 5100,
		intentIds: ['deployment'],
		categories: ['web', 'backend', 'infra'],
	},
	{
		skill: 'cloudflare/skills/wrangler',
		reason: 'Production deployment request',
		score: 124,
		estimatedInstalls: 4200,
		intentIds: ['deployment'],
		categories: ['web', 'backend', 'infra'],
	},
	{
		skill: 'openai/skills/cloudflare-deploy',
		reason: 'Production deployment request',
		score: 118,
		estimatedInstalls: 2100,
		intentIds: ['deployment'],
		categories: ['web', 'backend', 'infra'],
	},
	{
		skill: 'currents-dev/playwright-best-practices-skill/playwright-best-practices',
		reason: 'Testing request',
		score: 130,
		estimatedInstalls: 6700,
		intentIds: ['testing'],
		categories: ['web', 'testing'],
	},
	{
		skill: 'antfu/skills/vitest',
		reason: 'Testing request',
		score: 112,
		estimatedInstalls: 3900,
		intentIds: ['testing'],
		categories: ['testing'],
	},
	{
		skill: 'sleekdotdesign/agent-skills/design-review',
		reason: 'Design request',
		score: 122,
		estimatedInstalls: 1500,
		intentIds: ['design'],
		categories: ['web', 'design'],
	},
	{
		skill: 'vercel-labs/agent-skills/accessibility',
		reason: 'Design request',
		score: 110,
		estimatedInstalls: 800,
		intentIds: ['design'],
		categories: ['web', 'design'],
	},
	{
		skill: 'vercel-labs/agent-skills/frontend-design',
		reason: 'Design request',
		score: 104,
		estimatedInstalls: 1200,
		intentIds: ['design'],
		categories: ['web', 'design'],
	},
	{
		skill: 'microsoft/vscode-github-skills/vscode-dev-workbench-skill-md',
		reason: 'VS Code extension request',
		score: 142,
		estimatedInstalls: 2400,
		intentIds: ['vscode'],
		categories: ['extension', 'tooling'],
	},
	{
		skill: 'wshobson/agents/typescript-advanced-types',
		reason: 'Code quality request',
		score: 122,
		estimatedInstalls: 1800,
		intentIds: ['code-quality', 'refactor'],
		categories: ['language', 'quality', 'tooling'],
	},
	{
		skill: 'vercel-labs/agent-skills/composition-patterns',
		reason: 'Refactor request',
		score: 112,
		estimatedInstalls: 1100,
		intentIds: ['refactor'],
		categories: ['web', 'quality'],
	},
	{
		skill: 'wshobson/agents/api-documenter',
		reason: 'Documentation request',
		score: 108,
		estimatedInstalls: 1300,
		intentIds: ['docs'],
		categories: ['backend', 'docs'],
	},
];
