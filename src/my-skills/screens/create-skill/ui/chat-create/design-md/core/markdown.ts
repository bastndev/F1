import type { DesignColorOption, DesignMdSelection, DesignStyleOption, DesignTypographyOption } from './types';

interface DesignMdMarkdownOptions {
	productName?: string;
}

interface DesignColorTokens {
	primary: string;
	primaryStrong: string;
	primarySoft: string;
	accent: string;
	surface: string;
	surfaceMuted: string;
	text: string;
	border: string;
	success: string;
	warning: string;
	danger: string;
}

interface DesignTypographyTokens {
	family: string;
	displayFamily: string;
	monoFamily: string;
	source: string;
	weights: string;
	defaultWeight: number;
	tone: string;
}

interface DesignMdDocumentModel {
	productName: string;
	brandSummary: string;
	visualStyle: string;
	color: DesignColorTokens;
	colorName: string;
	colorDescription: string;
	typography: DesignTypographyTokens;
	typographyName: string;
	typographyDescription: string;
	spacingScale: string;
	style: DesignStyleOption;
	hasCustomStyle: boolean;
	accessibilityRequirements: string;
	writingTone: string;
	doRules: string[];
	dontRules: string[];
}

const DEFAULT_PRODUCT_NAME = 'Project Design System';
const DEFAULT_SPACING_SCALE = '4/8/12/16/24/32/48';
const DEFAULT_ACCESSIBILITY = 'WCAG 2.2 AA, keyboard-first interactions, visible focus states, semantic HTML before ARIA, reduced-motion support, accessible target sizes.';
const DEFAULT_WRITING_TONE = 'Clear, concise, implementation-focused, low-jargon, and helpful without being decorative.';
const EXISTING_COLOR_TOKENS: DesignColorTokens = {
	primary: 'existing primary color',
	primaryStrong: 'existing strong primary color',
	primarySoft: 'existing soft primary color',
	accent: 'existing accent color',
	surface: 'existing surface color',
	surfaceMuted: 'existing muted surface color',
	text: 'existing text color',
	border: 'existing border color',
	success: 'existing success color',
	warning: 'existing warning color',
	danger: 'existing danger color',
};
const EXISTING_TYPOGRAPHY_TOKENS: DesignTypographyTokens = {
	family: 'existing primary font stack',
	displayFamily: 'existing display font stack',
	monoFamily: 'existing monospace font stack',
	source: 'existing typography',
	weights: 'existing type scale weights',
	defaultWeight: 400,
	tone: 'existing',
};
const STYLE_PRESERVATION: DesignStyleOption = {
	id: 'existing-style',
	name: 'Style Preservation',
	description: 'Preserve the existing visual style.',
	references: ['Current product UI'],
};

export function createDesignMdMarkdown(selection: DesignMdSelection, options: DesignMdMarkdownOptions = {}): string {
	const design = createDesignDocumentModel(selection, options);
	return createDesignMarkdownFile(design);
}

function createDesignDocumentModel(selection: DesignMdSelection, options: DesignMdMarkdownOptions): DesignMdDocumentModel {
	const hasColorDecision = selection.color || selection.skipColor;
	const hasTypographyDecision = selection.typography || selection.skipTypography;
	const hasStyleDecision = selection.style || selection.skipStyle;
	if (!hasColorDecision || !hasTypographyDecision || !hasStyleDecision) {
		throw new Error('Cannot create DESIGN.md before all design choices are selected or skipped.');
	}

	if (!selection.color && !selection.typography && !selection.style) {
		throw new Error('Cannot create DESIGN.md without at least one selected design choice.');
	}

	const productName = normalizeProductName(options.productName);
	const colorName = selection.color?.name ?? 'Existing Colors';
	const colorDescription = selection.color?.description ?? 'Preserve the product\'s current color palette and semantic color roles.';
	const typographyName = selection.typography?.name ?? 'Existing Typography';
	const typographyDescription = selection.typography?.description ?? 'Preserve the product\'s current font stack, type scale, and text rhythm.';
	const hasCustomStyle = selection.style !== undefined;
	const style = selection.style ?? STYLE_PRESERVATION;
	const visualStyle = [
		`${colorName} color direction`,
		`${typographyName} typography`,
		hasCustomStyle ? `${style.name} style` : 'preserve existing style',
	].join(', ');

	return {
		productName,
		brandSummary: `${productName} defines portable, framework-agnostic design rules for web and mobile product interfaces. Use it as the source of truth before changing layouts, components, color, typography, motion, or interaction states.`,
		visualStyle,
		color: selection.color ? createColorTokens(selection.color) : EXISTING_COLOR_TOKENS,
		colorName,
		colorDescription,
		typography: selection.typography ? createTypographyTokens(selection.typography) : EXISTING_TYPOGRAPHY_TOKENS,
		typographyName,
		typographyDescription,
		spacingScale: DEFAULT_SPACING_SCALE,
		style,
		hasCustomStyle,
		accessibilityRequirements: DEFAULT_ACCESSIBILITY,
		writingTone: DEFAULT_WRITING_TONE,
		doRules: [
			'use semantic tokens before raw values in components',
			'preserve existing content, copy, media, routes, and behavior when applying this system to an existing project',
			'preserve hierarchy with spacing, contrast, typography, and component state',
			'define default, hover, active, focus-visible, disabled, loading, success, and error states',
			'design mobile-first, then enhance for tablet and desktop density',
			'keep implementation guidance portable across React, Vue, Svelte, plain HTML/CSS, and mobile UI stacks',
			...(hasCustomStyle ? getStyleDoRules(style) : ['preserve the existing visual style while applying selected color and typography changes']),
		],
		dontRules: [
			'use low-contrast text, hidden focus indicators, or color-only state communication',
			'delete or replace existing product content unless the user explicitly asks for content removal',
			'introduce one-off spacing, typography, or radius values outside the token system',
			'mix unrelated visual metaphors in the same screen',
			'depend on framework-specific component names in design rules',
			'add decorative motion without reduced-motion fallbacks',
			...(hasCustomStyle ? getStyleDontRules(style) : ['introduce a new visual style unless the user explicitly asks for one']),
		],
	};
}

function createDesignMarkdownFile(design: DesignMdDocumentModel): string {
	if (!design.hasCustomStyle) {
		return createCompactDesignMarkdownFile(design);
	}

	return [
		...createFrontmatterLines(design, 'Framework-agnostic design rules for web and mobile app implementation.', true),
		'',
		'# Design System Rules',
		'',
		'## Purpose',
		design.brandSummary,
		'',
		'This file is a portable design skill. Any AI or engineer should be able to read it and improve a web or mobile interface without needing React, Vue, Svelte, Tailwind, native mobile, or any other specific technology.',
		'',
		'## Operating Modes',
		'',
		'### New Project Mode',
		'- Use these rules to create a coherent first implementation when no existing UI exists.',
		'- Build the information architecture, component system, and responsive behavior from the tokens and rules below.',
		'',
		'### Existing Project Refactor Mode',
		'- Treat the existing product as the source of truth for content, routes, behavior, data, and information architecture.',
		'- Improve the visual system by patching styles, tokens, spacing, typography, hierarchy, responsive behavior, and component states.',
		'- Do not regenerate whole pages from scratch when a targeted patch can preserve the current experience.',
		'- Do not replace real content with placeholder, demo, lorem ipsum, or simplified content.',
		'- If a section looks inconsistent with this design system, restyle it first. Do not remove it.',
		'- If removing content, routes, features, media, or data logic seems necessary, stop and ask for approval.',
		'',
		'## Preservation Rules For Existing Products',
		'- Preserve all existing headings, paragraphs, labels, buttons, links, images, icons, forms, navigation items, sections, routes, and data-fetching logic unless the user explicitly requests removal.',
		'- Preserve semantic meaning and section order unless the user asks for an information-architecture change.',
		'- Preserve working interactions: forms, menus, language toggles, theme toggles, dialogs, tabs, carousels, and scroll behavior.',
		'- Preserve real brand/product names and domain-specific copy. Design changes must not make the page generic.',
		'- Keep every original section represented after the refactor. A redesigned section is acceptable; a missing section is not.',
		'- Never leave the first viewport empty unless the existing product intentionally has an empty state.',
		'',
		'## Safe Refactor Workflow',
		'1. Read the existing UI code before editing. Identify sections, routes, state, data dependencies, and user actions.',
		'2. Inventory current colors, typography, spacing, radius, shadows, and component states.',
		'3. Map old visual values to the tokens in this file one-to-one where possible.',
		'4. Patch section by section. Avoid full-file rewrites when the current structure works.',
		'5. After each section, verify the original content is still present, visible, and reachable.',
		'6. After changing colors, check every affected text/background pair for contrast.',
		'7. Verify desktop and mobile before finishing.',
		'',
		'## Visual Direction',
		`- Color direction: ${design.colorName} - ${design.colorDescription}.`,
		`- Typography direction: ${design.typographyName} - ${design.typographyDescription}.`,
		`- Style direction: ${design.hasCustomStyle ? `${design.style.name} - ${design.style.description}` : 'Preserve the existing visual style.'}`,
		...(design.hasCustomStyle ? [`- References: ${design.style.references.join(', ')}.`] : []),
		`- Visual style: ${design.visualStyle}.`,
		'',
		...createStyleGuidanceLines(design),
		'## Design Tokens',
		'Use semantic tokens first. Raw values from frontmatter are source values, not permission to scatter hex codes or one-off sizes through implementation.',
		'',
		'### Color',
		`- Primary action color: ${design.color.primary}.`,
		`- Strong primary: ${design.color.primaryStrong}. Use for high-emphasis text, selected state, or strong borders.`,
		`- Soft primary: ${design.color.primarySoft}. Use for subtle surfaces, selected backgrounds, or calm highlights.`,
		`- Surface: ${design.color.surface}.`,
		`- Muted surface: ${design.color.surfaceMuted}.`,
		`- Text: ${design.color.text}.`,
		`- Border: ${design.color.border}.`,
		'- Success, warning, and danger are semantic states. Pair them with labels, icons, or position; never rely on color alone.',
		'- When moving from a dark theme to a light or warm theme, update inherited light text classes such as white, muted-white, or low-opacity foregrounds.',
		'- Do not apply one warm/cream/brown palette across the entire page without contrast, hierarchy, and content anchors.',
		...createSelectionHighlightLines(design),
		'',
		'### Contrast And Visibility Gate',
		'- Every visible text node must remain readable after color changes.',
		'- Check hero text, navigation, buttons, card titles, form labels, helper text, icons, borders, and disabled states against their actual backgrounds.',
		'- If legacy classes or CSS keep text white on a light surface, replace them with semantic foreground tokens.',
		'- If content appears missing after a restyle, inspect contrast and visibility before deleting or rebuilding the section.',
		'- Do not finish with invisible text, hidden CTAs, empty hero areas, or decorative backgrounds replacing product content.',
		'',
		'### Typography',
		`- Primary family: ${design.typography.family}.`,
		`- Display family: ${design.typography.displayFamily}.`,
		`- Monospace family: ${design.typography.monoFamily}.`,
		`- Allowed weights: ${design.typography.weights}.`,
		`- Default UI weight: ${design.typography.defaultWeight}.`,
		'- Keep heading levels semantic. Visual size must follow layout importance, not HTML heading number.',
		'- Keep letter spacing at 0 by default. Use uppercase labels sparingly and only for short metadata.',
		'',
		'### Spacing And Radius',
		`- Spacing scale: ${design.spacingScale}.`,
		'- Prefer spacing and grouping over extra borders.',
		'- Use 4px radius for compact controls, 8px for standard cards/inputs, and 12px only for larger feature surfaces.',
		'- Do not invent new spacing values unless the layout cannot be solved with the scale.',
		'',
		'## Layout Rules',
		'- Start mobile-first. The smallest useful viewport defines the base layout.',
		'- Use content-driven breakpoints. Do not scale type directly with viewport width.',
		'- Keep navigation, primary actions, and form completion paths easy to reach on touch devices.',
		'- Prefer a clear grid, predictable alignment, and stable dimensions for controls, cards, tabs, and repeated items.',
		'- Empty, loading, and error states must preserve layout stability and explain the next action.',
		'',
		'## Component Rules',
		'- Every interactive component must define default, hover, active, focus-visible, disabled, loading, success, and error behavior when those states apply.',
		'- Buttons must communicate hierarchy through role: primary, secondary, tertiary, destructive, or icon-only.',
		'- Forms must keep labels visible, helper text close to the field, and errors specific enough to fix.',
		'- Cards must represent repeated items or contained tools. Do not nest cards inside other cards.',
		'- Modals and popovers must include focus management, escape behavior, and clear dismissal affordances.',
		'',
		'## Interaction And Motion',
		'- Motion must clarify state change, not decorate the screen.',
		'- Transitions should usually stay between 120ms and 260ms.',
		'- Provide reduced-motion behavior for animations, parallax, shimmer, and auto-moving content.',
		'- Pointer hover cannot be the only way to reveal important controls because touch devices do not have hover.',
		'',
		'## Accessibility Requirements',
		design.accessibilityRequirements,
		'',
		'- Text and meaningful non-text UI must meet WCAG 2.2 AA contrast.',
		'- Keyboard users must be able to reach, understand, and operate every interactive control.',
		'- Focus indicators must be visible, high-contrast, and not hidden by overflow or animation.',
		'- Semantic HTML or native platform semantics come before ARIA patches.',
		'- Touch targets should be at least 24px by WCAG 2.2 AA and should reach 44px when layout allows.',
		'',
		'## Content Tone',
		design.writingTone,
		'',
		'- Use direct labels for actions.',
		'- Avoid vague UI copy like "Submit" when the action can be named.',
		'- Keep empty states useful: state what happened, why it matters, and what the user can do next.',
		'',
		"## Rules: Do",
		list(design.doRules),
		'',
		"## Rules: Don't",
		list(design.dontRules),
		'',
		'## AI Implementation Checklist',
		'- Read this file before changing UI, layout, component styling, or interaction behavior.',
		'- Identify the target surface: mobile app, mobile web, desktop web, dashboard, landing page, form flow, or content-heavy view.',
		'- Map the design tokens to the project technology without changing the design intent.',
		'- Reuse existing project components when they can satisfy these rules.',
		'- If the current UI conflicts with this file, explain the conflict and choose the more accessible, consistent option.',
		'- Confirm all original navigation items, hero content, CTAs, media, sections, and forms still exist unless removal was requested.',
		'- Confirm no text became invisible from background, opacity, blend-mode, or inherited color changes.',
		'- Confirm the first viewport contains meaningful product content, not just a background treatment.',
		'- Verify keyboard navigation, focus-visible styling, responsive behavior, text overflow, loading state, and error state before finishing.',
	].join('\n');
}

function createCompactDesignMarkdownFile(design: DesignMdDocumentModel): string {
	return [
		...createFrontmatterLines(
			design,
			'Compact design rules for applying selected visual choices while preserving the existing product style.',
			false,
		),
		'',
		'# Design System Rules',
		'',
		'## Selected Direction',
		`- Color: ${design.colorName} - ${design.colorDescription}.`,
		`- Typography: ${design.typographyName} - ${design.typographyDescription}.`,
		'- Style: preserve the existing product style.',
		'',
		'## Style Preservation',
		'Keep the current visual style as the source of truth. Apply the selected color and typography choices without changing the product\'s existing layout language, component personality, visual metaphor, or brand feel.',
		'',
		'Only adjust style details when needed for contrast, accessibility, consistency, responsive behavior, or clear component states.',
		'',
		'## Design Tokens',
		`- Primary color: ${design.color.primary}.`,
		`- Strong primary: ${design.color.primaryStrong}.`,
		`- Soft primary: ${design.color.primarySoft}.`,
		`- Surface: ${design.color.surface}.`,
		`- Text: ${design.color.text}.`,
		`- Border: ${design.color.border}.`,
		`- Primary font: ${design.typography.family}.`,
		`- Allowed weights: ${design.typography.weights}.`,
		`- Default UI weight: ${design.typography.defaultWeight}.`,
		'',
		'## Implementation Rules',
		'- Use the selected color and typography tokens first; avoid scattering raw one-off values.',
		'- Preserve existing content, routes, interactions, layout structure, and component anatomy unless the user asks for deeper redesign.',
		'- Do not introduce a new style family, visual metaphor, or component personality when style was intentionally skipped.',
		'- Keep text readable, focus states visible, and interactive states clear.',
		'- Verify desktop and mobile before finishing.',
	].join('\n');
}

function createFrontmatterLines(design: DesignMdDocumentModel, description: string, includeLayoutTokens: boolean): string[] {
	return [
		'---',
		`name: ${yamlString(design.productName)}`,
		`description: ${yamlString(description)}`,
		'',
		'# ─── Colors ───────────────────────────────────────────────',
		'colors:',
		'  # Brand',
		`  primary:       ${yamlString(design.color.primary)}`,
		`  primaryStrong: ${yamlString(design.color.primaryStrong)}`,
		`  primarySoft:   ${yamlString(design.color.primarySoft)}`,
		`  accent:        ${yamlString(design.color.accent)}`,
		'',
		'  # Surfaces',
		`  surface:       ${yamlString(design.color.surface)}`,
		`  surfaceMuted:  ${yamlString(design.color.surfaceMuted)}`,
		'',
		'  # Text & Border',
		`  text:          ${yamlString(design.color.text)}`,
		`  border:        ${yamlString(design.color.border)}`,
		'',
		'  # Feedback',
		`  success:       ${yamlString(design.color.success)}`,
		`  warning:       ${yamlString(design.color.warning)}`,
		`  danger:        ${yamlString(design.color.danger)}`,
		'',
		'# ─── Typography ───────────────────────────────────────────',
		'typography:',
		`  family:        ${yamlString(design.typography.family)}`,
		`  displayFamily: ${yamlString(design.typography.displayFamily)}`,
		`  monoFamily:    ${yamlString(design.typography.monoFamily)}`,
		`  source:        ${yamlString(design.typography.source)}`,
		`  weights:       ${yamlString(design.typography.weights)}`,
		`  defaultWeight: ${design.typography.defaultWeight}`,
		`  tone:          ${yamlString(design.typography.tone)}`,
		...(includeLayoutTokens ? createLayoutFrontmatterLines() : []),
		'---',
	];
}

function createLayoutFrontmatterLines(): string[] {
	return [
		'',
		'# Spacing',
		'spacing:',
		'  xs:      4px',
		'  sm:      8px',
		'  md:      12px',
		'  lg:      16px',
		'  xl:      24px',
		'  xxl:     32px',
		'  section: 48px',
		'',
		'# Radius',
		'radius:',
		'  sm: 4px',
		'  md: 8px',
		'  lg: 12px',
		'',
		'# Motion',
		'motion:',
		'  fast:   120ms',
		'  normal: 180ms',
		'  slow:   260ms',
	];
}

function createSelectionHighlightLines(design: DesignMdDocumentModel): string[] {
	if (!design.hasCustomStyle) {
		return [];
	}

	return [
		'',
		'### Text Selection',
		`- Use this style-specific \`::selection\` treatment for ${design.style.name}. It should follow the selected color tokens and stay readable.`,
		'```css',
		...createSelectionCssLines(design),
		'```',
		'- If the selected color changes, keep the same style behavior but re-check text/background contrast.',
	];
}

function createSelectionCssLines(design: DesignMdDocumentModel): string[] {
	const color = design.color;
	const styleKey = design.style.tone ?? design.style.id;
	const onPrimary = readableTextFor(color.primary, color.text, color.surface);
	const onStrong = readableTextFor(color.primaryStrong, color.text, color.surface);

	switch (styleKey) {
		case 'bento':
			return selectionCssBlock('Bento selection: solid module highlight.', color.primaryStrong, onStrong, 'none');
		case 'liquid-glass':
			return selectionCssBlock('Liquid Glass selection: soft lens glow.', color.primarySoft, color.text, `0 0 12px ${color.primary}`);
		case 'glassmorphism':
			return selectionCssBlock('Glassmorphism selection: frosted tint.', color.primarySoft, color.text, `0 1px 14px ${color.surface}`);
		case 'neumorphism':
			return selectionCssBlock('Neumorphism selection: pressed soft surface.', color.surfaceMuted, color.primaryStrong, `1px 1px 0 ${color.surface}`);
		case 'minimalistic':
			return selectionCssBlock('Minimalistic selection: quiet editorial inversion.', color.text, color.surface, 'none');
		case 'pacman':
			return selectionCssBlock('Pac-Man selection: pellet-power highlight.', color.primary, onPrimary, `2px 2px 0 ${color.border}`);
		case 'dashboard':
			return selectionCssBlock('Dashboard selection: calm data highlight.', color.primarySoft, color.text, 'none');
		case 'matrix':
			return selectionCssBlock('Matrix selection: phosphor terminal glow.', color.primary, onPrimary, `0 0 10px ${color.primary}`);
		case '80s':
			return selectionCssBlock('80s selection: chunky old-computer highlight.', color.primaryStrong, onStrong, `2px 2px 0 ${color.primary}`);
		case 'perspective':
			return selectionCssBlock('Perspective selection: lifted spatial glow.', color.primarySoft, color.text, `0 2px 14px ${color.primary}`);
		case 'school':
			return selectionCssBlock('School selection: workbook marker block.', color.primary, onPrimary, `3px 3px 0 ${color.border}`);
		default:
			return selectionCssBlock('Style selection: token-based highlight.', color.primary, onPrimary, 'none');
	}
}

function selectionCssBlock(comment: string, background: string, foreground: string, textShadow: string): string[] {
	return [
		`/* ${comment} */`,
		'::selection {',
		`  background-color: ${background};`,
		`  color: ${foreground};`,
		`  text-shadow: ${textShadow};`,
		'}',
	];
}

function createColorTokens(color: DesignColorOption): DesignColorTokens {
	const palette = color.palette;
	const dark = pickPaletteColor(palette, 0, color.primary);
	const border = pickPaletteColor(palette, 2, color.primary);
	const surfaceMuted = pickPaletteColor(palette, Math.max(0, palette.length - 2), color.primary);
	const surface = pickPaletteColor(palette, palette.length - 1, color.primary);

	return {
		primary: color.primary,
		primaryStrong: color.hex[0] ?? dark,
		primarySoft: color.hex[2] ?? surface,
		accent: color.hex[1] ?? color.primary,
		surface,
		surfaceMuted,
		text: dark,
		border,
		success: '#16A34A',
		warning: '#D97706',
		danger: '#DC2626',
	};
}

function createTypographyTokens(typography: DesignTypographyOption): DesignTypographyTokens {
	const family = typography.families.join(', ');
	const source = typography.source === 'google' && typography.url
		? `Optional Google Font: ${typography.url}`
		: `${typography.source} font stack`;
	const displayFamily = typography.tone === 'serif' || typography.tone === 'display'
		? family
		: typography.families.join(', ');
	const monoFamily = typography.tone === 'mono'
		? family
		: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

	return {
		family,
		displayFamily,
		monoFamily,
		source,
		weights: typography.weights.join(', '),
		defaultWeight: typography.defaultWeight,
		tone: typography.tone ?? 'sans',
	};
}

function getStyleDoRules(style: DesignStyleOption): string[] {
	if (style.doRules?.length) {
		return style.doRules;
	}

	switch (style.tone ?? style.id) {
		case 'bento':
			return ['use modular regions with clear grouping and consistent card anatomy'];
		case 'neumorphism':
			return ['keep soft depth subtle and preserve contrast above the visual effect'];
		case 'artistic':
			return ['use expressive composition only when hierarchy and usability stay obvious'];
		case 'minimalistic':
			return ['let whitespace, bold type, compact actions, and quiet proof carry the interface'];
		case 'clean':
			return ['let whitespace, alignment, and concise copy carry the interface'];
		case 'perspective':
			return ['use depth and layering only to clarify navigation or priority'];
		case 'premium':
			return ['prioritize polished contrast, restrained motion, and deliberate whitespace'];
		case 'refined':
			return ['balance subtle details with predictable component behavior'];
		case 'neobrutalism':
			return ['make bold borders and blocks systematic, not random decoration'];
		case 'glassmorphism':
			return ['place translucent layers over controlled backgrounds with readable contrast'];
		case 'liquid-glass':
			return ['use fluid translucent material only where it improves hierarchy and preserves readability'];
		case 'shadcn':
			return ['keep components crisp, composable, accessible, and low-ornament'];
		case 'cafe':
			return ['use warmth in tone and surfaces while keeping product workflows efficient'];
		default:
			return ['make style choices serve task clarity before novelty'];
	}
}

function getStyleDontRules(style: DesignStyleOption): string[] {
	if (style.dontRules?.length) {
		return style.dontRules;
	}

	switch (style.tone ?? style.id) {
		case 'bento':
			return ['turn every section into a card when spacing alone creates enough structure'];
		case 'neumorphism':
			return ['use low-contrast raised surfaces that hide boundaries or state'];
		case 'artistic':
			return ['sacrifice readability or task flow for expressive layout'];
		case 'minimalistic':
			return ['remove product signal, trust proof, or necessary affordances in the name of minimalism'];
		case 'clean':
			return ['remove necessary affordances in the name of minimalism'];
		case 'perspective':
			return ['add 3D depth where a flat hierarchy would be clearer'];
		case 'premium':
			return ['overuse glossy effects, oversized type, or decorative gradients'];
		case 'refined':
			return ['make subtle states so quiet that users cannot tell what changed'];
		case 'neobrutalism':
			return ['use harsh contrast without a semantic role or accessible text contrast'];
		case 'glassmorphism':
			return ['place text directly on busy translucent backgrounds'];
		case 'liquid-glass':
			return ['replace real content with empty shiny surfaces or moving highlights'];
		case 'shadcn':
			return ['copy a component look without preserving semantics and states'];
		case 'cafe':
			return ['let warm color choices reduce contrast, density, or scannability'];
		default:
			return ['make isolated visual exceptions without documenting why'];
	}
}

function createStyleGuidanceLines(design: DesignMdDocumentModel): string[] {
	if (!design.hasCustomStyle) {
		return [
			'## Style Preservation',
			'Keep the current visual style as the source of truth. Apply the selected color and typography choices without changing the product\'s existing layout language, component personality, visual metaphor, or brand feel.',
			'',
			'Only adjust style details when needed for contrast, accessibility, consistency, responsive behavior, or clear component states.',
			'',
		];
	}

	return createStyleSystemLines(design.style);
}

function createStyleSystemLines(style: DesignStyleOption): string[] {
	const lines = [
		`## Style System: ${style.name}`,
		style.intent ?? style.description,
		'',
	];

	appendRuleSection(lines, '### Layout Rules', style.layoutRules);
	appendRuleSection(lines, '### Component Patterns', style.componentRules);
	appendRuleSection(lines, '### Existing Project Refactor Rules', style.refactorRules);
	appendRuleSection(lines, '### Spacing Rules', style.spacingRules);
	appendRuleSection(lines, '### Visual Hierarchy Rules', style.visualHierarchyRules);
	appendRuleSection(lines, '### Style Anti-patterns', style.dontRules);
	appendRuleSection(lines, '### Style Checklist', style.aiChecklist);

	return lines;
}

function appendRuleSection(lines: string[], title: string, rules: string[] | undefined) {
	if (!rules?.length) {
		return;
	}

	lines.push(title, ...rules.map(rule => `- ${sentence(rule)}`), '');
}

function normalizeProductName(value?: string): string {
	const trimmed = value?.trim();
	if (!trimmed || trimmed.toLowerCase() === 'workspace') {
		return DEFAULT_PRODUCT_NAME;
	}

	return /design system/i.test(trimmed) ? trimmed : `${trimmed} Design System`;
}

function pickPaletteColor(palette: string[], index: number, fallback: string): string {
	return palette[Math.min(Math.max(index, 0), Math.max(palette.length - 1, 0))] ?? fallback;
}

function list(items: string[]): string {
	return items.map(item => `- ${sentence(item)}`).join('\n');
}

function sentence(value: string): string {
	const trimmed = value.trim();
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function readableTextFor(background: string, darkText: string, lightText: string): string {
	const rgb = parseHexColor(background);
	if (!rgb) {
		return lightText;
	}

	const luminance = relativeLuminance(rgb);
	if (luminance > 0.58) {
		return parseHexColor(darkText) ? darkText : '#0B0F19';
	}

	return parseHexColor(lightText) ? lightText : '#FFFFFF';
}

function parseHexColor(value: string): [number, number, number] | undefined {
	const normalized = value.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) {
		return undefined;
	}

	const hex = normalized.length === 3
		? normalized.split('').map(char => `${char}${char}`).join('')
		: normalized;
	const numberValue = Number.parseInt(hex, 16);
	return [
		(numberValue >> 16) & 255,
		(numberValue >> 8) & 255,
		numberValue & 255,
	];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
	const [linearRed, linearGreen, linearBlue] = [red, green, blue].map(channel => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});

	return (0.2126 * linearRed) + (0.7152 * linearGreen) + (0.0722 * linearBlue);
}

function yamlString(value: string): string {
	return `"${escapeYamlString(value)}"`;
}

function escapeYamlString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
