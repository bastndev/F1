/** Character-tile koi renderer adapted from the supplied analizar/koi-pond reference. */
import { bodyHalfWidth, classify, FLAG_BARBEL, FLAG_EYE, FLAG_FIN, type ShapeHit } from "./shape";
import {
    clamp,
    hash3,
    KOI_NODES,
    smoothstep,
    type Box,
    type Koi,
    type World,
} from "./world";

export type Rgb = [number, number, number];

// How visible a koi stays while it swims under page content.
const DIM_UNDER_CONTENT = 0.08;

interface Palette {
    /** Page background, which tiles are mixed toward. */
    bg: Rgb;
    white: Rgb;
    red: Rgb;
    black: Rgb;
    fin: Rgb;
    eye: Rgb;
    alpha: number;
    /** How much a deep koi fades, as the alpha it keeps at the bottom of the pond. */
    depthFloor: number;
    /** How much skin colour a tile carries, from shadow (0) to lit (1); the rest is page background. */
    tile: [number, number];
    /** Hi (the red-orange of koi markings) from deep shadow to a lit highlight, so patches shade across hues. */
    hi: Rgb[];
    /** Glyph brightness relative to the tile under it. */
    ink: number;
}

const DARK: Palette = {
    bg: [26, 25, 33],
    white: [236, 228, 218],
    red: [232, 96, 56],
    black: [92, 90, 108],
    fin: [214, 206, 198],
    eye: [20, 20, 26],
    alpha: 0.8,
    depthFloor: 0.4,
    tile: [0.68, 0.98],
    hi: [
        [112, 22, 24],
        [168, 34, 28],
        [214, 58, 30],
        [240, 96, 34],
        [250, 138, 52],
        [255, 178, 96],
    ],
    ink: 0.42,
};

// Paper page: tiles are pale washes of the skin colour with dark glyphs etched on top.
const LIGHT: Palette = {
    bg: [245, 244, 241],
    white: [112, 108, 104],
    red: [204, 62, 28],
    black: [36, 33, 40],
    fin: [138, 132, 126],
    eye: [24, 22, 26],
    alpha: 0.9,
    depthFloor: 0.55,
    tile: [0.78, 0.55],
    hi: [
        [138, 24, 22],
        [184, 38, 24],
        [222, 62, 28],
        [238, 100, 38],
        [244, 140, 66],
        [248, 176, 116],
    ],
    ink: 0.45,
};

// Dense glyphs etched into each skin tile, sparse where it catches the light.
const TILE_GLYPHS = "t%SX8@#";
const SUBSAMPLES = [0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75];

// A line glyph that follows a direction in screen space, for fin rays and ripple rings.
function lineGlyph(dx: number, dy: number) {
    const d = Math.hypot(dx, dy) || 1;
    if (Math.abs(dy) < 0.38 * d) { return "-"; }
    if (Math.abs(dx) < 0.38 * d) { return "|"; }
    return dx * dy > 0 ? "\\" : "/";
}

function valueNoise(x: number, y: number, seed: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smoothstep(0, 1, x - xi);
    const v = smoothstep(0, 1, y - yi);
    const a = hash3(xi, yi, seed);
    const b = hash3(xi + 1, yi, seed);
    const c = hash3(xi, yi + 1, seed);
    const d = hash3(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A marking in body space: centred at (s, v) along and across the spine, as fractions of length. */
type Patch = { s: number; v: number; rs: number; rv: number };
type Markings = { red: Patch[]; black: Patch[] };

function inPatch(m: Patch, s: number, vn: number, wobble: number) {
    return ((s - m.s) / m.rs) ** 2 + ((vn - m.v) / m.rv) ** 2 < 1 + wobble;
}

/**
 * Each koi gets a fixed set of markings, seeded by its id, so every fish carries a clear pattern:
 * kohaku a red head and two or three red saddles on white, sanke the same plus small black spots,
 * tancho a single red disc on the crown.
 */
function koiMarkings(k: Koi): Markings {
    const r = (j: number) => hash3(k.id, j, 41);
    if (k.variety === "tancho") { return { red: [{ s: 0.11, v: 0, rs: 0.05, rv: 0.055 }], black: [] }; }

    const red: Patch[] = [];
    if (r(0) < 0.75) { red.push({ s: 0.1, v: (r(1) - 0.5) * 0.03, rs: 0.055 + r(2) * 0.03, rv: 0.11 }); }
    const saddles = 2 + Math.floor(r(3) * 2);
    for (let j = 0; j < saddles; j++) {
        const span = 0.42 / saddles;
        red.push({
            s: 0.25 + span * (j + 0.5) + (r(10 + j) - 0.5) * span * 0.3,
            v: (r(20 + j) - 0.5) * 0.05,
            rs: span * (0.32 + r(30 + j) * 0.12),
            rv: 0.09 + r(40 + j) * 0.05,
        });
    }

    const black: Patch[] = [];
    if (k.variety === "sanke") {
        const spots = 4 + Math.floor(r(50) * 3);
        for (let j = 0; j < spots; j++) {
            black.push({ s: 0.24 + r(60 + j) * 0.44, v: (r(70 + j) - 0.5) * 0.16, rs: 0.022, rv: 0.026 });
        }
    }
    return { red, black };
}

// Quantize the palette so animated shading has a small, bounded style cache.
const packRgb = (c: Rgb) => ((c[0] & 248) << 16) | ((c[1] & 248) << 8) | (c[2] & 248);
/** Sample a colour ramp at t in [0, 1]. */
function ramp(stops: Rgb[], t: number): Rgb {
    const x = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
}

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
    (a[0] + (b[0] - a[0]) * k) | 0,
    (a[1] + (b[1] - a[1]) * k) | 0,
    (a[2] + (b[2] - a[2]) * k) | 0,
];
const shade = (c: Rgb, k: number): Rgb => [
    Math.min(255, c[0] * k) | 0,
    Math.min(255, c[1] * k) | 0,
    Math.min(255, c[2] * k) | 0,
];

export class KoiRenderer {
    private ctx: CanvasRenderingContext2D;
    private dpr = 1;
    private cw = 8;
    private ch = 12;
    private cols = 0;
    private rows = 0;
    private palette = DARK;
    private styles = new Map<number, string>();
    private markingCache = new Map<number, Markings>();
    private fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";

    private cellGlyph = new Uint16Array(0);
    private cellColor = new Uint32Array(0);
    private cellAlpha = new Float32Array(0);
    private cellTile = new Uint32Array(0);
    private cellTileAlpha = new Float32Array(0);
    private cellDim = new Float32Array(0);
    private occupied = new Uint32Array(0);
    private occupiedCount = 0;
    private sortedKoi: Koi[] = [];

    private spine = new Float32Array(KOI_NODES * 2);
    private arc = new Float32Array(KOI_NODES);
    private segmentDx = new Float32Array(KOI_NODES - 1);
    private segmentDy = new Float32Array(KOI_NODES - 1);
    private segmentLength = new Float32Array(KOI_NODES - 1);
    private inverseLengthSquared = new Float32Array(KOI_NODES - 1);
    private arcTotal = 1;
    private flareLeft = 1;
    private flareRight = 1;
    // Scratch outputs of sample(), to avoid allocating per sample.
    private hit: ShapeHit = { flag: 0, across: 1, du: 1, da: 0 };
    private hitS = 0;
    private hitV = 0;
    private hitDist = 0;
    private hitTx = 1;
    private hitTy = 0;
    private hitSeg = 0;

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext("2d");
        if (!ctx) { throw new Error("2D canvas unavailable"); }
        this.ctx = ctx;
    }

    setTheme(isLight: boolean, background: Rgb) {
        this.palette = { ...(isLight ? LIGHT : DARK), bg: background };
        this.styles.clear();
    }

    resize(width: number, height: number, dpr: number) {
        this.dpr = dpr;
        // Near-square tiles, large enough to read each etched glyph.
        this.cw = clamp(Math.round(width / 125), 10, 14);
        this.ch = this.cw + 2;
        this.cols = Math.ceil(width / this.cw);
        this.rows = Math.ceil(height / this.ch);
        this.ctx.canvas.width = Math.round(width * dpr);
        this.ctx.canvas.height = Math.round(height * dpr);

        const n = this.cols * this.rows;
        this.cellGlyph = new Uint16Array(n);
        this.cellColor = new Uint32Array(n);
        this.cellAlpha = new Float32Array(n);
        this.cellTile = new Uint32Array(n);
        this.cellTileAlpha = new Float32Array(n);
        this.cellDim = new Float32Array(n).fill(1);
        this.occupied = new Uint32Array(n);
        return this.cw;
    }

    /** Fade koi under these canvas-space boxes, easing back in over a few cells around them. */
    setDimBoxes(boxes: Box[]) {
        const { cols, rows, cw, ch, cellDim } = this;
        cellDim.fill(1);
        const pad = cw * 4;
        for (const b of boxes) {
            const c0 = Math.max(0, Math.floor((b.left - pad) / cw));
            const c1 = Math.min(cols - 1, Math.floor((b.right + pad) / cw));
            const r0 = Math.max(0, Math.floor((b.top - pad) / ch));
            const r1 = Math.min(rows - 1, Math.floor((b.bottom + pad) / ch));
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    const x = c * cw + cw / 2;
                    const y = r * ch + ch / 2;
                    const d = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
                    const i = r * cols + c;
                    cellDim[i] = Math.min(
                        cellDim[i],
                        DIM_UNDER_CONTENT + (1 - DIM_UNDER_CONTENT) * smoothstep(0, pad, d)
                    );
                }
            }
        }
    }

    render(world: World) {
        const { ctx, dpr, cols } = this;
        if (cols === 0) { return; }

        this.cellGlyph.fill(0);
        this.cellTileAlpha.fill(0);
        this.occupiedCount = 0;
        // Deeper koi first, so the ones near the surface glide over them.
        this.sortedKoi.length = world.koi.length;
        for (let i = 0; i < world.koi.length; i++) { this.sortedKoi[i] = world.koi[i]; }
        this.sortedKoi.sort((a, b) => a.depth - b.depth);
        for (const k of this.sortedKoi) { this.rasterizeKoi(k, world.time); }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `600 ${Math.round(this.ch * 0.72)}px ${this.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        this.drawCells();
        ctx.globalAlpha = 1;
        if (this.styles.size > 2048) { this.styles.clear(); }
    }

    private style(rgb: number) {
        let s = this.styles.get(rgb);
        if (!s) {
            s = `rgb(${rgb >>> 16},${(rgb >>> 8) & 255},${rgb & 255})`;
            this.styles.set(rgb, s);
        }
        return s;
    }

    // ── koi ─────────────────────────────────────────────────────────────

    /** Find the nearest point on the render spine, then classify it against the koi's outline. */
    private sample(px: number, py: number, L: number, from = 0, to = KOI_NODES - 2) {
        const { spine, arc, segmentDx, segmentDy, segmentLength, inverseLengthSquared } = this;
        let best = Infinity;
        let bestSeg = from;
        let bestRaw = 0;
        let bestU = 0;
        for (let n = from; n <= to; n++) {
            const ax = spine[n * 2];
            const ay = spine[n * 2 + 1];
            const sx = segmentDx[n];
            const sy = segmentDy[n];
            const raw = ((px - ax) * sx + (py - ay) * sy) * inverseLengthSquared[n];
            const u = clamp(raw, 0, 1);
            const d2 = (px - ax - sx * u) ** 2 + (py - ay - sy * u) ** 2;
            if (d2 < best) {
                best = d2;
                bestSeg = n;
                bestRaw = raw;
                bestU = u;
            }
        }

        // Resolve body coordinates only for the nearest segment. Its geometry is
        // cached once per fish instead of recalculated for every character tile.
        const sx = segmentDx[bestSeg];
        const sy = segmentDy[bestSeg];
        const len = segmentLength[bestSeg];
        const cross = sx * (py - spine[bestSeg * 2 + 1]) - sy * (px - spine[bestSeg * 2]);
        const bestS = (arc[bestSeg] + bestU * len) / this.arcTotal;
        const bestSign = cross >= 0 ? 1 : -1;
        const past = bestSeg === KOI_NODES - 2 ? Math.max(0, bestRaw - 1) * len : 0;
        const ahead = bestSeg === 0 ? Math.max(0, -bestRaw) * len : 0;
        const lateral = Math.abs(cross) / len;
        this.hitTx = sx / len;
        this.hitTy = sy / len;
        this.hitSeg = bestSeg;
        const a = Math.sqrt(best);
        this.hitDist = a;
        this.hitS = bestS;
        this.hitV = a * bestSign;
        return classify(
            bestS,
            a / L,
            past / L,
            bestSign > 0 ? this.flareLeft : this.flareRight,
            this.hit,
            ahead / L,
            lateral / L
        );
    }

    /** Skin colour for a body point, from the koi's own markings pinned to body coordinates. */
    private skin(k: Koi, s: number, v: number, across: number): Rgb {
        const p = this.palette;
        const vn = v / k.length;
        // Belly edges and the tail stalk stay white on every variety, which frames the markings.
        if (across > 0.9 || s > 0.74) { return p.white; }
        // Ragged edges, so patches read as painted markings rather than ellipses.
        const wobble = (valueNoise(s * 14 + k.id, vn * 30, k.id + 3) - 0.5) * 0.6;
        const markings = this.markings(k);
        for (const m of markings.black) { if (inPatch(m, s, vn, wobble)) { return p.black; } }
        for (const m of markings.red) { if (inPatch(m, s, vn, wobble)) { return p.red; } }
        return p.white;
    }

    private markings(k: Koi) {
        let m = this.markingCache.get(k.id);
        if (!m) {
            m = koiMarkings(k);
            this.markingCache.set(k.id, m);
        }
        return m;
    }

    private rasterizeKoi(k: Koi, t: number) {
        const { spine, arc, cw, ch, cols, rows, cellGlyph, cellColor, cellAlpha, cellTile, cellTileAlpha, palette } =
            this;
        const L = k.length;
        const nodes = k.nodes;
        // The body only undulates while the tail is beating; coasting koi hold almost straight.
        const swim = 0.2 + 1.1 * k.beat;

        // Travelling body wave that grows toward the tail.
        for (let n = 0; n < KOI_NODES; n++) {
            const s = n / (KOI_NODES - 1);
            const a = Math.max(0, n - 1);
            const b = Math.min(KOI_NODES - 1, n + 1);
            let tx = nodes[a * 2] - nodes[b * 2];
            let ty = nodes[a * 2 + 1] - nodes[b * 2 + 1];
            const tl = Math.hypot(tx, ty) || 1;
            tx /= tl;
            ty /= tl;
            const amp = L * 0.04 * (0.05 + 0.95 * Math.pow(s, 2.2)) * swim;
            const off = amp * Math.sin(k.phase - s * 4.6);
            spine[n * 2] = nodes[n * 2] - ty * off;
            spine[n * 2 + 1] = nodes[n * 2 + 1] + tx * off;
        }
        arc[0] = 0;
        for (let n = 1; n < KOI_NODES; n++) {
            const dx = spine[n * 2] - spine[(n - 1) * 2];
            const dy = spine[n * 2 + 1] - spine[(n - 1) * 2 + 1];
            const lengthSquared = dx * dx + dy * dy || 1;
            const length = Math.sqrt(lengthSquared);
            this.segmentDx[n - 1] = dx;
            this.segmentDy[n - 1] = dy;
            this.segmentLength[n - 1] = length;
            this.inverseLengthSquared[n - 1] = 1 / lengthSquared;
            arc[n] = arc[n - 1] + length;
        }
        this.arcTotal = arc[KOI_NODES - 1] || 1;
        // Pectorals tuck in during a burst, scull in turn while coasting, and the inner one spreads to brake on a turn.
        const spread = 1 - 0.25 * k.beat;
        const scull = 0.18 * (1 - k.beat) * Math.sin(k.finPhase);
        const bank = clamp(k.turn * 0.6, -0.35, 0.35);
        this.flareLeft = spread + scull - bank;
        this.flareRight = spread - scull + bank;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let n = 0; n < KOI_NODES; n++) {
            minX = Math.min(minX, spine[n * 2]);
            maxX = Math.max(maxX, spine[n * 2]);
            minY = Math.min(minY, spine[n * 2 + 1]);
            maxY = Math.max(maxY, spine[n * 2 + 1]);
        }
        const reach = L * 0.26;
        const c0 = Math.max(0, Math.floor((minX - reach) / cw));
        const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
        const r0 = Math.max(0, Math.floor((minY - reach) / ch));
        const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
        if (c0 > c1 || r0 > r1) { return; }

        const diag = Math.hypot(cw, ch);
        // Deep koi carry less contrast than those near the surface.
        const dim = palette.alpha * (palette.depthFloor + (1 - palette.depthFloor) * k.depth);
        const [tile0, tile1] = palette.tile;
        const hit = this.hit;

        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const x = c * cw;
                const y = r * ch;
                const centerHit = this.sample(x + cw / 2, y + ch / 2, L);
                // Nothing reaches far from the spine at the waist, where the fins end.
                if (!centerHit && this.hitDist > L * (this.hitS > 0.4 && this.hitS < 0.62 ? 0.15 : 0.25) + diag) {
                    // Distance to the spine changes by at most a cell per cell, so skip cells that can't reach it.
                    c += Math.max(0, Math.floor((this.hitDist - L * 0.25 - diag) / cw));
                    continue;
                }
                // Sub-samples sit within a cell of the centre, so only the neighbouring segments can be nearest.
                const from = Math.max(0, this.hitSeg - 2);
                const to = Math.min(KOI_NODES - 2, this.hitSeg + 2);
                let { flag, across } = hit;
                let s = this.hitS;
                let v = this.hitV;
                let tx = this.hitTx;
                let ty = this.hitTy;

                let hits = centerHit ? 1 : 0;
                // Points from the cell centre toward the covered side, i.e. across the outline into the koi.
                let gx = 0;
                let gy = 0;
                // Cells well inside the body can't have a sub-sample outside it, so skip straight to full coverage.
                const deepInside =
                    centerHit &&
                    flag !== FLAG_FIN &&
                    flag !== FLAG_BARBEL &&
                    s > 0.04 &&
                    s < 0.72 &&
                    bodyHalfWidth(s) * L - this.hitDist > diag * 0.35;
                if (deepInside) { hits = 5; }
                for (let q = 0; !deepInside && q < SUBSAMPLES.length; q += 2) {
                    if (!this.sample(x + SUBSAMPLES[q] * cw, y + SUBSAMPLES[q + 1] * ch, L, from, to)) { continue; }
                    gx += (SUBSAMPLES[q] - 0.5) * cw;
                    gy += (SUBSAMPLES[q + 1] - 0.5) * ch;
                    if (hits === 0) {
                        ({ flag, across } = hit);
                        s = this.hitS;
                        v = this.hitV;
                        tx = this.hitTx;
                        ty = this.hitTy;
                    }
                    hits++;
                }
                if (hits === 0) { continue; }
                this.hitTx = tx;
                this.hitTy = ty;
                const coverage = hits / 5;
                const side = v >= 0 ? 1 : -1;

                const i = r * cols + c;
                // Body-anchored key so each glyph rides along with the skin.
                const key = (hash3(Math.round(s * 90), Math.round(v / (cw * 0.8)), k.id) * 4294967295) >>> 0;
                const solid = centerHit && coverage >= 0.6;

                let glyph = " ";
                let rgb: Rgb = palette.fin;
                let alpha = dim;
                let tile: Rgb | null = null;
                let tileAlpha = 0;
                if (flag === FLAG_BARBEL) {
                    // Drawn along the whisker: forward from the mouth and angled out to its side.
                    glyph = lineGlyph(-tx - side * ty * 0.7, -ty + side * tx * 0.7);
                    rgb = shade(mix(palette.bg, palette.fin, 0.9), palette.ink + 0.3);
                } else if (flag === FLAG_EYE && solid) {
                    tile = mix(palette.bg, palette.eye, 0.85);
                    tileAlpha = dim;
                    glyph = "o";
                    rgb = mix(palette.bg, palette.white, 0.9);
                } else if (flag === FLAG_FIN) {
                    // Fins are a pale veil of tiles flecked with dots, so they never compete with the body.
                    tile = mix(palette.bg, palette.fin, 0.55);
                    tileAlpha = dim * 0.45 * coverage;
                    if (key % 2 === 0) {
                        glyph = ".";
                        alpha *= 0.6 * coverage;
                    }
                } else {
                    // Each skin cell is a tile washed in the skin colour, shaded like a rounded back lit from
                    // the top-left, with a dense glyph etched on top. Edge cells get a paler, empty tile.
                    const skin = this.skin(k, s, v, across);
                    const facing = side * (0.6 * ty - 0.8 * tx) * across;
                    const lum = clamp(0.22 + 0.5 * Math.sqrt(1 - across * across) + 0.18 * facing, 0, 1);
                    if (skin === palette.red) {
                        // Red patches run the full hi ramp: crimson in shadow, vermilion across the back, orange
                        // to amber where the light hits. Each koi leans a little redder or more orange, and a
                        // slow body-pinned noise varies the hue within a patch, like real pigment.
                        const lean = (hash3(k.id, 5, 17) - 0.5) * 0.3;
                        const grain = (valueNoise(s * 9 + k.id, (v / L) * 18, k.id + 21) - 0.5) * 0.25;
                        // A band of shine travels down the body, like light sliding over wet scales.
                        const sheen = Math.max(0, Math.sin(s * 11 - t * 1.8 + k.id) - 0.7) / 0.3;
                        tile = ramp(palette.hi, 0.15 + 0.8 * lum + lean + grain + sheen * 0.35);
                    } else {
                        tile = mix(palette.bg, skin, tile0 + (tile1 - tile0) * lum);
                    }
                    if (hits === 5) {
                        tileAlpha = dim;
                        const jitter = (key >>> 4) % 3;
                        glyph = TILE_GLYPHS[clamp(Math.round((1 - lum) * 4) + jitter, 0, TILE_GLYPHS.length - 1)];
                        rgb = shade(tile, palette.ink);
                        // White skin is etched lightly so the red and black patches carry the pattern.
                        if (skin === palette.white) { alpha *= 0.6; }
                        // Scales glint on a staggered clock.
                        const tick = Math.floor(t * 1.4 + (key % 997) / 97);
                        if (hash3(key, tick, 7) < 0.03) { tile = mix(tile, palette.bg, 0.45); }
                    } else {
                        tileAlpha = dim * coverage * 0.55;
                        if (Math.hypot(gx, gy) > cw * 0.2 && key % 3 === 0) {
                            glyph = ".";
                            rgb = shade(tile, palette.ink);
                        }
                    }
                }
                if (glyph === " " && tileAlpha === 0) { continue; }
                if (!cellGlyph[i]) { this.occupied[this.occupiedCount++] = i; }
                cellTile[i] = tile ? packRgb(tile) : 0;
                cellTileAlpha[i] = tileAlpha;
                cellGlyph[i] = glyph.charCodeAt(0);
                cellColor[i] = packRgb(rgb);
                cellAlpha[i] = alpha;
            }
        }
    }

    private drawCells() {
        const { ctx, cw, ch, cols, cellGlyph, cellColor, cellAlpha, cellTile, cellTileAlpha, cellDim } = this;
        for (let n = 0; n < this.occupiedCount; n++) {
            const i = this.occupied[n];
            const code = cellGlyph[i];
            if (!code) { continue; }
            const x = (i % cols) * cw;
            const y = ((i / cols) | 0) * ch;
            if (cellTileAlpha[i] > 0) {
                ctx.globalAlpha = cellTileAlpha[i] * cellDim[i];
                ctx.fillStyle = this.style(cellTile[i]);
                ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
            }
            if (code === 32) { continue; }
            ctx.globalAlpha = cellAlpha[i] * cellDim[i];
            ctx.fillStyle = this.style(cellColor[i]);
            ctx.fillText(String.fromCharCode(code), x + cw / 2, y + ch / 2 + 1);
        }
    }
}
