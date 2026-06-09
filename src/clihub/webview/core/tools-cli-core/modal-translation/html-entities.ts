export function decodeHtmlEntities(text: string): string {
	const namedEntities: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		'#39': "'",
	};

	return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (entity, name: string) => {
		const normalizedName = name.toLowerCase();
		if (normalizedName.startsWith('#x')) {
			return decodeCodePoint(Number.parseInt(normalizedName.slice(2), 16), entity);
		}
		if (normalizedName.startsWith('#')) {
			return decodeCodePoint(Number.parseInt(normalizedName.slice(1), 10), entity);
		}

		return namedEntities[normalizedName] ?? entity;
	});
}

function decodeCodePoint(value: number, fallback: string): string {
	try {
		return Number.isFinite(value) ? String.fromCodePoint(value) : fallback;
	} catch {
		return fallback;
	}
}
