/**
 * The create-flow loading screen: the stepped "creating your skill" checklist
 * shown while the host writes the boilerplate, plus the timed success
 * animation that walks the remaining steps before handing back to the flow.
 * Extracted from shell.ts as a createCreateLoading(deps) factory; owns the
 * loading-screen DOM lookups and step timers. Flow transitions (closing the
 * chat screen, error copy) stay with the caller — it only signals onComplete.
 */
export interface CreateLoadingDeps {
	setInputDisabled(disabled: boolean): void;
	/** The success animation finished (or there is no loading DOM to animate). */
	onComplete(): void;
}

export type CreateLoading = ReturnType<typeof createCreateLoading>;

export const createCreateLoading = (deps: CreateLoadingDeps) => {
	let isCreateLoadingActive = false;
	let createLoadingStepTimer: number | undefined;

	function getCreateLoadingElements(): { loadingScreen: HTMLElement; steps: HTMLElement[] } | undefined {
		const loadingScreen = document.querySelector('[data-create-loading-screen]') as HTMLElement | null;
		if (!loadingScreen) {
			return undefined;
		}

		return {
			loadingScreen,
			steps: Array.from(loadingScreen.querySelectorAll<HTMLElement>('[data-loading-step]')),
		};
	}

	/** Hide the screen and clear all step states (no timer changes). */
	function resetScreen(): void {
		const loading = getCreateLoadingElements();
		if (!loading) {
			return;
		}

		loading.loadingScreen.hidden = true;
		loading.steps.forEach(step => {
			step.classList.remove('is-active', 'is-done');
		});
	}

	/** Stop any running step timer and drop the active flag (screen untouched). */
	function cancel(): void {
		if (createLoadingStepTimer !== undefined) {
			window.clearTimeout(createLoadingStepTimer);
			createLoadingStepTimer = undefined;
		}
		isCreateLoadingActive = false;
	}

	/** Show the screen on its first step while the host does the real work. */
	function beginHostWait(): void {
		deps.setInputDisabled(true);
		if (createLoadingStepTimer !== undefined) {
			window.clearTimeout(createLoadingStepTimer);
			createLoadingStepTimer = undefined;
		}
		isCreateLoadingActive = false;

		const loading = getCreateLoadingElements();
		if (!loading) {
			return;
		}

		loading.loadingScreen.hidden = false;
		loading.steps.forEach(step => {
			step.classList.remove('is-active', 'is-done');
		});
		loading.steps[0]?.classList.add('is-active');
	}

	function finishSuccessAnimation(): void {
		if (!isCreateLoadingActive) {
			return;
		}

		isCreateLoadingActive = false;
		if (createLoadingStepTimer !== undefined) {
			window.clearTimeout(createLoadingStepTimer);
			createLoadingStepTimer = undefined;
		}

		deps.onComplete();
	}

	/** Walk the remaining steps to done, then signal onComplete. */
	function startSuccessAnimation(): void {
		const loading = getCreateLoadingElements();
		if (!loading) {
			deps.onComplete();
			return;
		}

		if (createLoadingStepTimer !== undefined) {
			window.clearTimeout(createLoadingStepTimer);
		}

		isCreateLoadingActive = true;
		deps.setInputDisabled(true);
		const loadingScreen = loading.loadingScreen;
		const steps = loading.steps;
		loadingScreen.hidden = false;
		if (!steps.some(step => step.classList.contains('is-active') || step.classList.contains('is-done'))) {
			steps[0]?.classList.add('is-active');
		}

		let stepIndex = getNextCreateLoadingStepIndex(steps);

		function advanceStep() {
			if (stepIndex > 0) {
				const prevStep = steps[stepIndex - 1];
				if (prevStep) {
					prevStep.classList.remove('is-active');
					prevStep.classList.add('is-done');
				}
			}

			if (stepIndex < steps.length) {
				const currentStep = steps[stepIndex];
				if (currentStep) {
					currentStep.classList.add('is-active');
				}
				stepIndex++;
				createLoadingStepTimer = window.setTimeout(advanceStep, 700);
			} else {
				createLoadingStepTimer = window.setTimeout(finishSuccessAnimation, 400);
			}
		}

		advanceStep();
	}

	function getNextCreateLoadingStepIndex(steps: HTMLElement[]): number {
		const activeIndex = steps.findIndex(step => step.classList.contains('is-active'));
		if (activeIndex >= 0) {
			return activeIndex + 1;
		}

		const doneCount = steps.filter(step => step.classList.contains('is-done')).length;
		return Math.min(doneCount, steps.length);
	}

	return {
		beginHostWait,
		startSuccessAnimation,
		resetScreen,
		cancel
	};
};
