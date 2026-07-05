const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelector('.readme-back-link')?.addEventListener('click', event => {
	event.preventDefault();
	window.close();
});

document.querySelectorAll<HTMLAnchorElement>('.readme-content a[href]').forEach(link => {
	const href = link.getAttribute('href');
	if (href?.startsWith('http://') || href?.startsWith('https://')) {
		link.setAttribute('target', '_blank');
		link.setAttribute('rel', 'noopener noreferrer');
	}
});

if (!prefersReducedMotion.matches) {
	document.querySelectorAll('pre code').forEach(block => {
		const lines = block.innerHTML.split('\n');
		if (lines.length > 1) {
			block.innerHTML = lines.map((line, index) =>
				`<span class="code-line" style="--code-line-index:${index}">${line}</span>`
			).join('\n');
		}
	});
}
