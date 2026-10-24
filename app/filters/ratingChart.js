// Builds the "Rating over time" chart as an inline SVG at build time (this
// replaced ApexCharts, which loaded ~275KB of JavaScript on every list page).
//
// The SVG stretches to the container width (preserveAspectRatio="none"), so
// lines use vector-effect="non-scaling-stroke" to keep an even thickness and
// the y-axis labels are HTML rather than SVG text.
const WIDTH = 1000;
const HEIGHT = 160;
const MAX = 10;

const escape = text => String(text)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;');

const round = n => Math.round(n * 10) / 10;

// Smooth curve through the points (Catmull-Rom converted to cubic Béziers),
// with control points clamped so the line never goes above 10 or below 0
function smoothPath(points) {
	if (points.length < 3) {
		return points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)},${round(y)}`).join('');
	}

	const clampY = y => Math.min(HEIGHT, Math.max(0, y));
	let d = `M${round(points[0][0])},${round(points[0][1])}`;

	for (let i = 0; i < points.length - 1; i++) {
		const [x0, y0] = points[i - 1] || points[i];
		const [x1, y1] = points[i];
		const [x2, y2] = points[i + 1];
		const [x3, y3] = points[i + 2] || points[i + 1];

		const c1x = x1 + (x2 - x0) / 6;
		const c1y = clampY(y1 + (y2 - y0) / 6);
		const c2x = x2 - (x3 - x1) / 6;
		const c2y = clampY(y2 - (y3 - y1) / 6);

		d += `C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(x2)},${round(y2)}`;
	}

	return d;
}

module.exports = function ratingChart(stats) {
	if (!stats || !stats.ratings || stats.ratings.length < 2) {
		return '';
	}

	const ratings = stats.ratings;
	const step = WIDTH / (ratings.length - 1);
	const toY = rating => HEIGHT - (rating / MAX) * HEIGHT;
	const points = ratings.map((rating, i) => [i * step, toY(rating)]);

	const line = smoothPath(points);
	const area = `${line}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`;
	const meanY = round(toY(stats.mean));
	const [lastX, lastY] = points[points.length - 1];

	const grid = [0, 5, 10]
		.map(value => `<line x1="0" x2="${WIDTH}" y1="${toY(value)}" y2="${toY(value)}" class="ratingChart__grid" vector-effect="non-scaling-stroke"/>`)
		.join('');

	// One invisible full-height strip per beer, so hovering shows its title
	const hovers = ratings
		.map((rating, i) => `<rect x="${round(i * step - step / 2)}" width="${round(step)}" height="${HEIGHT}"><title>${escape(stats.titles[i])}: ${rating}/10</title></rect>`)
		.join('');

	return `<div class="ratingChart">
	<div class="ratingChart__labels" aria-hidden="true"><span>10</span><span>5</span><span>0</span></div>
	<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Rating over time for ${ratings.length} beers, averaging ${stats.mean} out of 10">
		<defs>
			<linearGradient id="ratingChartFill" x1="0" y1="0" x2="0" y2="1">
				<stop offset="20%" stop-color="#2b76b9" stop-opacity="0.35"/>
				<stop offset="100%" stop-color="#2b76b9" stop-opacity="0.05"/>
			</linearGradient>
		</defs>
		${grid}
		<path d="${area}" fill="url(#ratingChartFill)"/>
		<path d="${line}" class="ratingChart__line" vector-effect="non-scaling-stroke"/>
		<line x1="0" x2="${WIDTH}" y1="${meanY}" y2="${meanY}" class="ratingChart__mean" vector-effect="non-scaling-stroke"/>
		<line x1="${round(lastX)}" x2="${round(lastX)}" y1="${round(lastY)}" y2="${round(lastY)}" class="ratingChart__latest" vector-effect="non-scaling-stroke"/>
		<g class="ratingChart__hover">${hovers}</g>
	</svg>
</div>`;
};
