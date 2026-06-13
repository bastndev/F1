import type { ComboRule } from '../types';

export const COMBO_RULES: ComboRule[] = [
	{
		id: 'next-prisma',
		name: 'Next.js + Prisma',
		requires: ['nextjs', 'prisma'],
		categories: ['web', 'database'],
		skills: ['vercel-labs/next-skills/next-best-practices', 'prisma/skills/prisma-client-api'],
		searchTerms: ['nextjs prisma'],
	},
	{
		id: 'react-typescript',
		name: 'React + TypeScript',
		requires: ['react', 'typescript'],
		categories: ['web', 'language'],
		skills: ['vercel-labs/agent-skills/react-best-practices', 'wshobson/agents/typescript-advanced-types'],
		searchTerms: ['react typescript'],
	},
	{
		id: 'expo-react-native',
		name: 'Expo + React Native',
		requires: ['expo', 'react-native'],
		categories: ['mobile'],
		skills: ['expo/skills/building-native-ui', 'expo/skills/native-data-fetching'],
		searchTerms: ['expo react native mobile'],
	},
	{
		id: 'frontend-testing',
		name: 'Frontend testing',
		requires: ['react', 'playwright'],
		categories: ['web', 'testing'],
		skills: ['currents-dev/playwright-best-practices-skill/playwright-best-practices'],
		searchTerms: ['frontend testing playwright'],
	},
	{
		id: 'vscode-typescript-extension',
		name: 'VS Code + TypeScript',
		requires: ['vscode-extension', 'typescript'],
		categories: ['extension', 'tooling'],
		skills: [
			'microsoft/vscode-github-skills/vscode-dev-workbench-skill-md',
			'wshobson/agents/typescript-advanced-types',
		],
		searchTerms: ['vscode extension typescript webview'],
	},
	{
		id: 'skills-extension-workspace',
		name: 'Agent skills workspace',
		requires: ['agent-skills', 'typescript'],
		categories: ['ai', 'tooling', 'docs'],
		skills: [],
		searchTerms: ['agent skills discovery'],
	},
	{
		id: 'typescript-quality-tooling',
		name: 'TypeScript quality tooling',
		requires: ['typescript', 'eslint'],
		categories: ['language', 'quality', 'tooling'],
		skills: ['wshobson/agents/typescript-advanced-types'],
		searchTerms: ['typescript eslint code quality'],
	},
];
