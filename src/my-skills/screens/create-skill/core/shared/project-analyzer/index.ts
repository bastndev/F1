import { analyzeWorkspaceForRecommendations } from './analyzer';
import { getCachedProjectAnalysis, setCachedProjectAnalysis } from './cache';
import type { ProjectAnalysis } from './types';

export * from './types';

let projectAnalysisPromise: Promise<ProjectAnalysis> | undefined;

export async function getProjectAnalysis(): Promise<ProjectAnalysis> {
	let analysis = getCachedProjectAnalysis();

	if (!analysis) {
		projectAnalysisPromise ??= analyzeWorkspaceForRecommendations()
			.then(nextAnalysis => {
				setCachedProjectAnalysis(nextAnalysis);
				return nextAnalysis;
			})
			.finally(() => {
				projectAnalysisPromise = undefined;
			});
		analysis = await projectAnalysisPromise;
	}

	return analysis;
}

export function prewarmProjectAnalysis(): void {
	getProjectAnalysis();
}
