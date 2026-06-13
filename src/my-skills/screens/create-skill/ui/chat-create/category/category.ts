import { getCategories, getSubcategories, type CategoryId, type CategoryOption, type SubcategoryOption } from '../../../core/chat-create-core/data/categories';

interface CategorySelectionDetail {
	categoryId: CategoryId;
	subcategoryId: SubcategoryId | null;
}

type SubcategoryId = string;

export function initCategorySelection() {
	const container = document.querySelector<HTMLElement>('[data-create-category-container]');
	const branchesTop = document.querySelector<HTMLElement>('[data-create-category-branches-top]');
	const branchesBottom = document.querySelector<HTMLElement>('[data-create-category-branches-bottom]');

	if (!container || !branchesTop || !branchesBottom) {
		return;
	}

	let selectedCategory: CategoryId | null = null;
	let selectedSubcategory: SubcategoryId | null = null;
	let currentSkillName = '';

	function renderTopCategories(skillName?: string) {
		const branches = Array.from(branchesTop!.querySelectorAll('.create-category-branch'));
		const categories = getCategories(skillName);

		branches.forEach((branch, index) => {
			const category = categories[index];
			const chip = branch.querySelector('.create-category-chip') as HTMLSpanElement | null;
			if (!chip || !category) {
				branch.removeAttribute('data-dynamic-id');
				branch.classList.remove('is-selected');
				chip?.classList.remove('is-selected');
				return;
			}

			chip.textContent = category.label;
			branch.setAttribute('data-dynamic-id', category.id);
			branch.classList.toggle('is-selected', selectedCategory === category.id);
			chip.classList.toggle('is-selected', selectedCategory === category.id);
			chip.onclick = () => selectCategory(category);
		});
	}

	function renderSubcategories(categoryId: CategoryId) {
		const subcategories = getSubcategories(categoryId, currentSkillName);
		branchesBottom!.innerHTML = '';

		subcategories.forEach((sub, index) => {
			const branch = document.createElement('div');
			branch.className = 'create-category-branch';
			branch.style.animationDelay = `${index * 50}ms`;

			const chip = document.createElement('span');
			chip.className = 'create-category-chip';
			chip.textContent = sub.label;
			chip.dataset.subcategoryId = sub.id;

			chip.addEventListener('click', () => selectSubcategory(sub));

			branch.appendChild(chip);
			branchesBottom!.appendChild(branch);
		});

		branchesBottom!.hidden = false;
	}

	function selectCategory(category: CategoryOption) {
		if (selectedCategory === category.id) {
			return;
		}

		selectedCategory = category.id;
		selectedSubcategory = null;

		branchesTop!.querySelectorAll<HTMLElement>('.create-category-branch').forEach(branch => {
			const chip = branch.querySelector('.create-category-chip');
			const isSelected = branch.getAttribute('data-dynamic-id') === category.id;
			branch.classList.toggle('is-selected', isSelected);
			chip?.classList.toggle('is-selected', isSelected);
		});

		branchesBottom!.hidden = true;
		branchesBottom!.innerHTML = '';

		// If it's the "others" category, skip subcategories entirely
		if (category.id === 'others') {
			container!.classList.add('is-hiding');
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent<CategorySelectionDetail>('createSkill.category.selected', {
					detail: {
						categoryId: selectedCategory!,
						subcategoryId: null,
					},
				}));
			}, 400);
			return;
		}

		requestAnimationFrame(() => {
			renderSubcategories(category.id);
		});

		window.dispatchEvent(new CustomEvent('createSkill.category.mainSelected', {
			detail: {
				categoryId: category.id,
				categoryLabel: category.label,
			},
		}));
	}

	function selectSubcategory(subcategory: SubcategoryOption) {
		selectedSubcategory = subcategory.id;

		// Update bottom chips
		branchesBottom!.querySelectorAll<HTMLElement>('.create-category-chip').forEach(chip => {
			chip.classList.toggle('is-selected', chip.dataset.subcategoryId === subcategory.id);
		});

		// Trigger smooth exit animation
		container!.classList.add('is-hiding');

		// Dispatch selection event after animation completes
		setTimeout(() => {
			window.dispatchEvent(new CustomEvent<CategorySelectionDetail>('createSkill.category.selected', {
				detail: {
					categoryId: selectedCategory!,
					subcategoryId: selectedSubcategory,
				},
			}));
		}, 400); // 400ms matches the CSS animation duration
	}

	renderTopCategories();

	window.addEventListener('createSkill.category.reset', () => {
		selectedCategory = null;
		selectedSubcategory = null;

		container!.classList.remove('is-hiding');

		branchesTop!.querySelectorAll<HTMLElement>('.create-category-branch').forEach(branch => {
			branch.classList.remove('is-selected');
			branch.querySelector('.create-category-chip')?.classList.remove('is-selected');
		});

		branchesBottom!.hidden = true;
		branchesBottom!.innerHTML = '';
		renderTopCategories(currentSkillName);
	});

	window.addEventListener('createSkill.skillName.confirm', event => {
		if (!(event instanceof CustomEvent) || typeof event.detail?.name !== 'string') {
			return;
		}

		currentSkillName = event.detail.name;
		selectedCategory = null;
		selectedSubcategory = null;
		container!.classList.remove('is-hiding');
		branchesBottom!.hidden = true;
		branchesBottom!.innerHTML = '';
		renderTopCategories(currentSkillName);
	});
}
