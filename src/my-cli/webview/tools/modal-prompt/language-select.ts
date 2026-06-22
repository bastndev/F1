/**
 * Source-language picker that lives in the prompt header (replaces the old
 * static "🌐 → EN" chip). The translator target is always English; the user
 * picks the SOURCE. The choice drives translation, spell-check language and the
 * strict-toggle visibility (see shared/prompt/languages.ts) and is required
 * before the textarea unlocks.
 *
 * Indicator format (target-first, as requested):
 *   • no language yet → "🌐"
 *   • English         → "🇬🇧"        (source == target, no arrow)
 *   • other           → "EN ← 🇪🇸"   (flag may fall back to letters on some fonts)
 *
 * The choice persists in localStorage 'f1-prompt-lang' (sibling of
 * 'f1-translate-auto' / 'f1-spellcheck-strict').
 */
import { PROMPT_LANGUAGES, PROMPT_LANG_GLOBE, getPromptLanguage, isPromptLang, type PromptLang } from '../../../shared/prompt';

const STORAGE_KEY = 'f1-prompt-lang';

export interface LanguageSelectController {
	/** The persisted/selected source language, or undefined before any pick. */
	getLang: () => PromptLang | undefined;
}

/**
 * The user's chosen prompt language (or undefined before any pick). Exported so
 * the Translator modal can mirror it as its translation target (CLI → this lang).
 */
export const getStoredPromptLang = (): PromptLang | undefined => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isPromptLang(stored) ? stored : undefined;
	} catch {
		return undefined;
	}
};

const persistLang = (lang: PromptLang) => {
	try {
		localStorage.setItem(STORAGE_KEY, lang);
	} catch {
		/* storage unavailable */
	}
};

export function initLanguageSelect(
	host: HTMLElement,
	onChange: (lang: PromptLang) => void,
): LanguageSelectController {
	const picker = host.querySelector<HTMLElement>('#langToggle');
	let current = getStoredPromptLang();

	if (!picker) {
		return { getLang: () => current };
	}

	picker.classList.add('prompt-lang-picker');
	picker.replaceChildren();

	const trigger = document.createElement('button');
	trigger.type = 'button';
	trigger.className = 'prompt-lang-trigger';
	trigger.setAttribute('aria-haspopup', 'listbox');
	trigger.setAttribute('aria-expanded', 'false');
	trigger.title = 'Choose the language you write in (always translated to English)';

	const indicator = document.createElement('span');
	indicator.className = 'prompt-lang-current';

	const caret = document.createElement('span');
	caret.className = 'prompt-lang-caret';
	caret.textContent = '▾';
	caret.setAttribute('aria-hidden', 'true');

	trigger.append(indicator, caret);

	const menu = document.createElement('div');
	menu.className = 'prompt-lang-menu';
	menu.setAttribute('role', 'listbox');

	const renderIndicator = () => {
		indicator.replaceChildren();
		const lang = current ? getPromptLanguage(current) : undefined;

		// First-run nudge: the composer stays locked until a language is chosen, so
		// pulse the globe (CSS .is-unset) to point the user at the picker. Cleared
		// the moment a language is selected — and it persists, so it never returns.
		trigger.classList.toggle('is-unset', !lang);

		if (!lang) {
			const globe = document.createElement('span');
			globe.className = 'prompt-lang-flag';
			globe.textContent = PROMPT_LANG_GLOBE;
			indicator.append(globe);
			return;
		}

		// English: source == target, show the flag alone (no direction arrow).
		if (lang.translates) {
			const dir = document.createElement('span');
			dir.className = 'prompt-lang-dir';
			dir.textContent = 'EN ←';
			indicator.append(dir);
		}

		const flag = document.createElement('span');
		flag.className = 'prompt-lang-flag';
		flag.textContent = lang.flag;
		indicator.append(flag);
	};

	const syncActive = () => {
		for (const item of Array.from(menu.querySelectorAll<HTMLButtonElement>('[data-lang]'))) {
			item.classList.toggle('active', item.dataset.lang === current);
		}
	};

	const closeMenu = () => {
		menu.classList.remove('open');
		trigger.setAttribute('aria-expanded', 'false');
		document.removeEventListener('click', onOutsideClick, true);
	};

	const onOutsideClick = (event: MouseEvent) => {
		if (!picker.contains(event.target as Node)) {
			closeMenu();
		}
	};

	for (const lang of PROMPT_LANGUAGES) {
		const item = document.createElement('button');
		item.type = 'button';
		item.className = 'prompt-lang-item';
		item.setAttribute('role', 'option');
		item.dataset.lang = lang.code;

		const flag = document.createElement('span');
		flag.className = 'prompt-lang-item-flag';
		flag.textContent = lang.flag;

		const label = document.createElement('span');
		label.className = 'prompt-lang-item-label';
		label.textContent = lang.label;

		item.append(flag, label);

		item.addEventListener('click', () => {
			closeMenu();
			if (current === lang.code) {
				return;
			}
			current = lang.code;
			persistLang(lang.code);
			renderIndicator();
			syncActive();
			onChange(lang.code);
		});

		menu.append(item);
	}

	trigger.addEventListener('click', () => {
		const isOpen = menu.classList.toggle('open');
		trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
		if (isOpen) {
			document.addEventListener('click', onOutsideClick, true);
		} else {
			document.removeEventListener('click', onOutsideClick, true);
		}
	});

	picker.append(trigger, menu);
	renderIndicator();
	syncActive();

	return { getLang: () => current };
}
