export interface ExtractedReferenceSection {
	title: string;
	body: string;
	score: number;
}

const MAX_MARKDOWN_CHARS = 60_000;
const MAX_SECTION_CHARS = 900;
const MAX_SECTION_BULLETS = 5;
const MAX_LINE_CHARS = 240;

const SECTION_PRIORITIES: Array<{ pattern: RegExp; score: number }> = [
	{ pattern: /\bwhen\s+to\s+use\b/i, score: 110 },
	{ pattern: /\bwhen\s+not\s+to\s+use\b/i, score: 105 },
	{ pattern: /\b(setup|implementation|review|safe|test|modeling)\s+workflow\b/i, score: 100 },
	{ pattern: /\bworkflow\b/i, score: 92 },
	{ pattern: /\bquick\s+reference\b/i, score: 90 },
	{ pattern: /\b(common\s+)?(gotchas|mistakes|pitfalls)\b/i, score: 86 },
	{ pattern: /\bsecurity\b/i, score: 84 },
	{ pattern: /\brules?\b/i, score: 80 },
	{ pattern: /\b(output\s+format|output\s+spec)\b/i, score: 74 },
	{ pattern: /\binstructions?\b/i, score: 70 },
	{ pattern: /\bhow\s+it\s+works\b/i, score: 68 },
];

const UNSAFE_LINE_PATTERNS = [
	/<\s*script\b/i,
	/\bon\w+\s*=/i,
	/\bjavascript\s*:/i,
	/\b(ignore|bypass|override)\s+(all\s+)?(previous|system|developer)\s+(instructions?|messages?|prompts?)\b/i,
	/\b(system|developer)\s+(prompt|message|instructions?)\b/i,
	/\bjailbreak\b/i,
	/\bexfiltrat(e|es|ing|ion)\b/i,
	/\bsend\s+(your\s+)?(api\s*key|token|secret|password)\b/i,
];

function stripFrontmatter(markdown: string): string {
	const normalized = markdown.replace(/\r\n?/g, '\n').slice(0, MAX_MARKDOWN_CHARS);
	if (!normalized.startsWith('---\n')) {
		return normalized;
	}

	const end = normalized.indexOf('\n---\n', 4);
	return end === -1 ? normalized : normalized.slice(end + 5);
}

function scoreTitle(title: string): number {
	for (const priority of SECTION_PRIORITIES) {
		if (priority.pattern.test(title)) {
			return priority.score;
		}
	}

	return 0;
}

function removeCodeBlocks(value: string): string {
	return value
		.replace(/```[\s\S]*?```/g, '')
		.replace(/~~~[\s\S]*?~~~/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
}

function stripMarkdownLinks(value: string): string {
	return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

function stripHtmlTags(value: string): string {
	return value.replace(/<[^>]*>/g, '');
}

function cleanLine(value: string): string {
	const cleaned = stripHtmlTags(stripMarkdownLinks(value))
		.replace(/^#{1,6}\s+/, '')
		.replace(/^\s{0,3}[-*+]\s+/, '')
		.replace(/^\s{0,3}\d+[.)]\s+/, '')
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	return cleaned.slice(0, MAX_LINE_CHARS).trim();
}

function isSafeReferenceLine(line: string): boolean {
	return !UNSAFE_LINE_PATTERNS.some(pattern => pattern.test(line));
}

function cleanSectionBody(body: string): string {
	const lines = removeCodeBlocks(body)
		.split('\n')
		.filter(isSafeReferenceLine)
		.map(cleanLine)
		.filter(line => line.length > 0)
		.filter(isSafeReferenceLine)
		.filter(line => !line.startsWith('|'))
		.filter(line => !/^[-:| ]+$/.test(line));

	const bullets = Array.from(new Set(lines)).slice(0, MAX_SECTION_BULLETS);
	return bullets.join('\n').slice(0, MAX_SECTION_CHARS).trim();
}

function parseLevelTwoSections(markdown: string): ExtractedReferenceSection[] {
	const sections: ExtractedReferenceSection[] = [];
	const lines = stripFrontmatter(markdown).split('\n');
	let currentTitle = '';
	let currentBody: string[] = [];

	function flush() {
		if (!currentTitle) {
			currentBody = [];
			return;
		}

		const body = cleanSectionBody(currentBody.join('\n'));
		const score = scoreTitle(currentTitle);
		if (body && score > 0) {
			sections.push({ title: currentTitle, body, score });
		}

		currentTitle = '';
		currentBody = [];
	}

	for (const line of lines) {
		const heading = line.match(/^##\s+(.+?)\s*$/);
		if (heading) {
			flush();
			currentTitle = heading[1].replace(/[#*_`]/g, '').trim();
			continue;
		}

		currentBody.push(line);
	}

	flush();
	return sections;
}

function extractFallbackSection(markdown: string): ExtractedReferenceSection[] {
	const body = cleanSectionBody(stripFrontmatter(markdown));
	if (!body) {
		return [];
	}

	return [{
		title: 'Reference Notes',
		body,
		score: 1,
	}];
}

export function extractReferenceSkillSections(markdown: string, maxSections = 2): ExtractedReferenceSection[] {
	const sections = parseLevelTwoSections(markdown);
	const selected = (sections.length > 0 ? sections : extractFallbackSection(markdown))
		.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
		.slice(0, maxSections);

	return selected;
}
