import type { ProjectAnalysis } from './types';

let cachedAnalysis: ProjectAnalysis | undefined;

export function getCachedProjectAnalysis(): ProjectAnalysis | undefined {
	return cachedAnalysis;
}

export function setCachedProjectAnalysis(analysis: ProjectAnalysis): void {
	cachedAnalysis = analysis;
}

export function clearCachedProjectAnalysis(): void {
	cachedAnalysis = undefined;
}
