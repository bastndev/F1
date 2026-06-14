import type { SkillFastRenderContext, SkillFastTemplate } from './types';

export interface SkillFastIntentSignals {
	terms: string[];
	visualIdentity: string[];
	colorRows: string[][];
	motionRows: string[][];
	materialRows: string[][];
}

const WEAK_TERMS = new Set([
	'about',
	'also',
	'and',
	'app',
	'can',
	'color',
	'create',
	'design',
	'etc',
	'for',
	'give',
	'help',
	'letter',
	'letters',
	'make',
	'need',
	'normal',
	'please',
	'project',
	'skill',
	'style',
	'theme',
	'the',
	'this',
	'to',
	'transition',
	'transitions',
	'user',
	'want',
	'way',
	'web',
	'with',
	'you',
]);

const KNOWN_TERM_FIXES: Array<[RegExp, string]> = [
	[/\bbetno\b/gi, 'bento'],
	[/\bbentoo\b/gi, 'bento'],
	[/\bglass\s+morphism\b/gi, 'glassmorphism'],
	[/\bglassmorphic\b/gi, 'glassmorphism'],
	[/\bament\b/gi, 'ambient'],
	[/\bamient\b/gi, 'ambient'],
	[/\baniment\b/gi, 'animation'],
	[/\baniamations\b/gi, 'animations'],
	[/\baniamation\b/gi, 'animation'],
	[/\bhoover\b/gi, 'hover'],
	[/\bliquid\s+glas\b/gi, 'liquid glass'],
	[/\bliquidglass\b/gi, 'liquid glass'],
	[/\bglass\s+liquid\b/gi, 'liquid glass'],
	[/\bdarck\b/gi, 'dark'],
	[/\byelow\b/gi, 'yellow'],
	[/\byelllow\b/gi, 'yellow'],
	[/\bbg\b/gi, 'background'],
];

const VISUAL_DESIGN_TEMPLATE_KEYS = new Set([
	'web:web-design',
	'web:web-styles',
	'web:landing-ui',
	'mobile:mobile-ui',
	'mobile:mobile-animation',
	'ui-ux:design-system',
	'ui-ux:visual-polish',
	'ui-ux:layout-system',
	'ui-ux:motion-design',
]);

function compact(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSkillFastIntent(value: string): string {
	let normalized = compact(value);

	for (const [pattern, replacement] of KNOWN_TERM_FIXES) {
		normalized = normalized.replace(pattern, replacement);
	}

	return normalized
		.replace(/^(web|mobile|backend|ui[-\s]?ux|ai|testing|security|database)\s*-\s*[\w-]+\/[\w-]+\s*/i, '')
		.replace(/\bi\s+want\s+(you\s+to\s+)?/gi, '')
		.replace(/\bgive\s+me\s+(a\s+)?/gi, '')
		.replace(/\bcolors?\s+that\s+\w+\s+would\s+like\b/gi, 'colors')
		.replace(/\beme\s+would\s+like\b/gi, '')
		.replace(/\bprimary\s+color\s+red\b/gi, 'primary red')
		.replace(/\bsecondary\s+color\s+gray\b/gi, 'secondary gray')
		.replace(/\bsecondary\s+color\s+grey\b/gi, 'secondary gray')
		.replace(/\bprimary\s+color\s+blue\b/gi, 'primary blue')
		.replace(/\bblue\s+background\s+colors?\b/gi, 'blue background')
		.replace(/\bfor\s+the\s+project\b/gi, '')
		.replace(/\bthe\s+yellow\s+texts?\b/gi, 'yellow text')
		.replace(/\bthe\s+way\s+to\s+bento\b/gi, 'bento style')
		.replace(/\bbento\s+my\s+theme\b/gi, 'bento style with theme')
		.replace(/\bmy\s+theme\s+of\s+red\s+color\s+the\s+yellow\s+text\b/gi, 'a red theme with yellow text')
		.replace(/\bred\s+color\s+(and\s+)?(the\s+)?yellow\s+text\b/gi, 'red theme with yellow text')
		.replace(/\bhover\s+me\b/gi, 'slow hover states')
		.replace(/\bslow\s+for\s+(the\s+)?hover\s+letters?\b/gi, 'slow hover transitions')
		.replace(/\bslow\s+for\s+(the\s+)?hover\b/gi, 'slow hover transitions')
		.replace(/\bslow\s+animations?,\s*when\s+hovering\b/gi, 'slow hover animations')
		.replace(/\bslow\s+animations?\s+when\s+hovering\b/gi, 'slow hover animations')
		.replace(/\bwhen\s+hovering\b/gi, 'hover states')
		.replace(/\btransitions,\s*slow\s+hover\s+transitions\b/gi, 'slow hover transitions')
		.replace(/\bslow\s+ambient\s+animation\s+very\s+slow\b/gi, 'very slow ambient animation')
		.replace(/\bvery\s+slow\s+very\s+slow\b/gi, 'very slow')
		.replace(/\s+,/g, ',')
		.replace(/,\s*,+/g, ',')
		.replace(/\s+/g, ' ')
		.trim();
}

function hasAny(value: string, patterns: RegExp[]): boolean {
	return patterns.some(pattern => pattern.test(value));
}

function hasSlowHoverIntent(value: string): boolean {
	return hasAny(value, [
		/\bslow\s+hover/i,
		/\bhover\w*\b.*\bslow\b/i,
		/\bslow\s+animations?\b.*\bhover/i,
		/\bslow\b.*\bhover\s+states?\b/i,
	]);
}

function hasFastMotionIntent(value: string): boolean {
	return hasAny(value, [
		/\bfast\b.*\b(hover|animation|motion|transition)/i,
		/\b(hover|animation|motion|transition)\w*\b.*\bfast\b/i,
		/\b(snappy|quick|rapid)\b.*\b(hover|animation|motion|transition)/i,
		/\bfluid\b.*\b(hover|animation|motion|transition)/i,
	]);
}

function hasAnimationDisabled(value: string): boolean {
	return hasAny(value, [
		/\b(without|no|disable|disabled|avoid|remove)\s+(decorative\s+)?(animations?|motion)\b/i,
		/\b(static|non[-\s]?animated)\b/i,
	]);
}

function hasGlassmorphismIntent(value: string): boolean {
	return /\bglassmorphism\b|\bfrosted\s+glass\b|\bglass\s+effect\b/i.test(value);
}

function isVisualDesignTemplate(template?: SkillFastTemplate): boolean {
	if (!template) {
		return false;
	}

	return VISUAL_DESIGN_TEMPLATE_KEYS.has(`${template.categoryId}:${template.id}`);
}

function getHoverTransitionIntent(value: string, includeBaseline: boolean): string[] | undefined {
	if (!/\b(hover|animation|motion|transition)\w*\b/i.test(value)) {
		return includeBaseline
			? ['200ms ease', 'Default interactive hover feedback; keep even when decorative animation is disabled.']
			: undefined;
	}

	if (hasSlowHoverIntent(value) || /\bvery\s+slow\b/i.test(value)) {
		return ['350ms ease', 'All hover transitions without exception.'];
	}

	if (hasFastMotionIntent(value)) {
		return ['150ms ease', 'Fast fluid hover; all interactive elements.'];
	}

	return includeBaseline
		? ['200ms ease', 'Default interactive hover feedback; keep even when decorative animation is disabled.']
		: undefined;
}

function hasInteractiveMaterialIntent(value: string): boolean {
	return /\b(button|buttons|hover|animation|motion|transition|modern|fluid|fast|slow|interactive)\b/i.test(value);
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function setRow(rows: string[][], row: string[]): void {
	const index = rows.findIndex(candidate => candidate[0] === row[0]);
	if (index >= 0) {
		rows[index] = row;
		return;
	}

	rows.push(row);
}

function extractTerms(normalized: string, template?: SkillFastTemplate): string[] {
	const phraseTerms: string[] = [];
	if (/\bbento\b/i.test(normalized)) {
		phraseTerms.push('bento hierarchy');
	}
	if (/\bliquid\s+glass\b/i.test(normalized)) {
		phraseTerms.push('liquid glass');
	}
	if (hasGlassmorphismIntent(normalized)) {
		phraseTerms.push('glassmorphism panels');
	}
	if (hasAnimationDisabled(normalized)) {
		phraseTerms.push('static interaction');
	}
	if (/\bslow\b/i.test(normalized) && /\bhover/i.test(normalized)) {
		phraseTerms.push('slow hover');
	}
	if (hasFastMotionIntent(normalized)) {
		phraseTerms.push('fast fluid hover');
	}
	if (/\bambient\b/i.test(normalized) && /\banimat/i.test(normalized)) {
		phraseTerms.push('ambient animation');
	}
	if (/\bblue\b/i.test(normalized)) {
		phraseTerms.push('blue palette');
	}
	if (/\bred\b/i.test(normalized) && /\byellow\b/i.test(normalized)) {
		phraseTerms.push('red and yellow palette');
	}
	if (/\bdark\b/i.test(normalized) && /\bwhite\b/i.test(normalized)) {
		phraseTerms.push('dark and white contrast');
	}

	const tokenTerms = normalized
		.toLowerCase()
		.replace(/[^a-z0-9+#.]+/g, ' ')
		.split(/\s+/)
		.map(token => token.trim())
		.filter(token => token.length > 2 && !WEAK_TERMS.has(token));

	const templateTerms = template ? [template.title.toLowerCase()] : [];
	return unique([...phraseTerms, ...tokenTerms, ...templateTerms]).slice(0, 5);
}

export function extractSkillFastIntentSignals(
	description: string,
	template?: SkillFastTemplate,
	context?: SkillFastRenderContext,
): SkillFastIntentSignals {
	const normalized = normalizeSkillFastIntent([
		description,
		context?.name ?? '',
		...(context?.techs ?? []),
	].join(' '));

	const visualIdentity: string[] = [];
	const visualBaseline = isVisualDesignTemplate(template);
	const animationDisabled = hasAnimationDisabled(normalized);
	const glassmorphism = hasGlassmorphismIntent(normalized);
	const hoverTransition = getHoverTransitionIntent(normalized, visualBaseline);
	if (/\bbento\b/i.test(normalized)) {
		visualIdentity.push('bento grid hierarchy');
	}
	if (/\bliquid\s+glass\b/i.test(normalized)) {
		visualIdentity.push('liquid-glass interactive material');
	}
	if (glassmorphism) {
		visualIdentity.push('glassmorphism panels');
	}
	if (!glassmorphism && !/\bliquid\s+glass\b/i.test(normalized) && /\bbento\b/i.test(normalized) && hasInteractiveMaterialIntent(normalized)) {
		visualIdentity.push('liquid-glass interactive accents');
	}
	if (/\bborderless\b/i.test(normalized)) {
		visualIdentity.push('borderless bento surfaces');
	}
	if (/\bdark\b.*\bwhite\b|\bwhite\b.*\bdark\b/i.test(normalized)) {
		visualIdentity.push('dark-and-white contrast');
	}
	if (/\bred\b/i.test(normalized) && /\byellow\b/i.test(normalized)) {
		visualIdentity.push('red surfaces with yellow text accents');
	}
	if (/\bblue\b/i.test(normalized)) {
		visualIdentity.push('blue interactive palette');
	}
	if (hoverTransition?.[0] === '350ms ease') {
		visualIdentity.push('slow hover transitions around 300-500ms');
	}
	if (hoverTransition?.[0] === '150ms ease') {
		visualIdentity.push('fast fluid hover transitions around 150ms');
	}
	if (animationDisabled) {
		visualIdentity.push('static interaction treatment without decorative animation');
	}
	if (!animationDisabled && /\bambient\b/i.test(normalized) && /\banimat/i.test(normalized)) {
		visualIdentity.push('ambient animation');
	}
	if (visualIdentity.length === 0 && !animationDisabled && /\banimat(e|ion|ions)|\bmotion\b/i.test(normalized)) {
		visualIdentity.push('purposeful motion');
	}

	const colorRows: string[][] = [];
	if (visualBaseline || /\bred\b/i.test(normalized)) {
		setRow(colorRows, ['primary', '#DC2626', 'Red action or surface accent.']);
		setRow(colorRows, ['primaryStrong', '#991B1B', 'High-emphasis red border, selected state, or danger-adjacent emphasis.']);
	}
	if (/\bblue\b/i.test(normalized)) {
		setRow(colorRows, ['primary', '#1D4ED8', 'Blue accent, CTA, active state.']);
		setRow(colorRows, ['primaryStrong', '#1E40AF', 'High-emphasis blue border, selected state, or active outline.']);
		setRow(colorRows, ['primaryLight', '#DBEAFE', 'Soft blue surface or hover fill.']);
	}
	if (/\byellow\b/i.test(normalized)) {
		if (!/\bred\b|\bblue\b/i.test(normalized)) {
			setRow(colorRows, ['primary', '#FACC15', 'Yellow action or emphasis accent.']);
			setRow(colorRows, ['primaryStrong', '#A16207', 'High-emphasis yellow-brown border or selected state.']);
		}
		setRow(colorRows, ['accentText', '#FACC15', 'Yellow emphasis text, badges, counters, and active details.']);
		setRow(colorRows, ['accentSoft', '#FEF3C7', 'Soft yellow highlight behind short labels only.']);
	}
	if (/\bgray\b|\bgrey\b/i.test(normalized)) {
		if (!/\bred\b|\bblue\b|\byellow\b/i.test(normalized)) {
			setRow(colorRows, ['primary', '#6B7280', 'Gray primary accent for neutral visual systems.']);
			setRow(colorRows, ['primaryStrong', '#374151', 'High-emphasis gray border, selected state, or active outline.']);
		}
		setRow(colorRows, ['secondary', '#6B7280', 'Gray surfaces, muted labels, inactive states.']);
	}
	if (hoverTransition) {
		setRow(colorRows, ['hoverTransition', hoverTransition[0], hoverTransition[1]]);
	}
	if (visualBaseline || /\bdark\b/i.test(normalized) || /\bbackground\b/i.test(normalized) || glassmorphism || (/\bbento\b/i.test(normalized) && /\bwhite\s+text\b/i.test(normalized))) {
		setRow(colorRows, ['backgroundDark', '#0A0A0A', 'Page and panel background.']);
		setRow(colorRows, ['surface', '#0B0B0F', 'Bento canvas or card background.']);
	}
	if (visualBaseline || /\bwhite\b/i.test(normalized)) {
		setRow(colorRows, ['text', '#F8FAFC', 'Foreground on dark surfaces.']);
	}

	const motionRows: string[][] = [];
	if (hoverTransition?.[0] === '350ms ease') {
		motionRows.push(['Hover', hoverTransition[0], 'Slow enough to feel deliberate without blocking task flow.']);
	}
	if (hoverTransition?.[0] === '150ms ease') {
		motionRows.push(['Hover', hoverTransition[0], 'Fast enough to feel responsive while still showing state change.']);
	}
	if (hoverTransition?.[0] === '200ms ease') {
		motionRows.push(['Hover', hoverTransition[0], animationDisabled
			? 'Interaction feedback only; do not add decorative animation.'
			: 'Default interactive feedback that keeps state changes visible.']);
	}
	if (!animationDisabled && /\banimat/i.test(normalized)) {
		motionRows.push(['Micro animation', '220-360ms', 'Use for state changes, not decoration.']);
	}
	if (!animationDisabled && /\bambient\b/i.test(normalized)) {
		motionRows.push(['Ambient motion', '900-1600ms', 'Keep subtle, low opacity, and reduced-motion aware.']);
	}

	const materialRows: string[][] = [];
	if (/\bbento\b/i.test(normalized)) {
		materialRows.push(['Bento layout', 'Group related actions into stable modules with clear hierarchy.']);
	}
	if (/\bborderless\b/i.test(normalized)) {
		materialRows.push(['Borderless surfaces', 'Remove visible borders; use shadow depth and spacing to define module edges.']);
	}
	if (glassmorphism) {
		materialRows.push(['Glassmorphism panels', 'Use backdrop-filter: blur(16px); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);']);
	}
	if (/\bliquid\s+glass\b/i.test(normalized) || (!glassmorphism && /\bbento\b/i.test(normalized) && hasInteractiveMaterialIntent(normalized))) {
		const transition = hoverTransition?.[0] ?? 'token-based';
		materialRows.push(['Liquid glass buttons', `Use backdrop-filter: blur(12px), semi-transparent background, soft border, and ${transition} border transition.`]);
	}
	if (visualBaseline || /\bbento\b/i.test(normalized) || /\bred\b/i.test(normalized) || /\byellow\b/i.test(normalized) || /\bblue\b/i.test(normalized)) {
		materialRows.push(['Typography', 'Display: "DM Serif Display", body: "Inter" at 400/500 only. Never default system fonts.']);
	}

	return {
		terms: extractTerms(normalized, template),
		visualIdentity: unique(visualIdentity),
		colorRows: unique(colorRows.map(row => row.join('\t'))).map(row => row.split('\t')),
		motionRows: unique(motionRows.map(row => row.join('\t'))).map(row => row.split('\t')),
		materialRows: unique(materialRows.map(row => row.join('\t'))).map(row => row.split('\t')),
	};
}
