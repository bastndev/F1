/** Koi outline adapted from the supplied analizar/koi-pond reference. */
import { smoothstep } from "./world";

export const FLAG_BODY = 1;
export const FLAG_FIN = 2;
export const FLAG_EYE = 3;
export const FLAG_DORSAL = 4;
export const FLAG_BARBEL = 5;

/** Where a point landed on the koi; `du`/`da` give the fin-ray direction in body space. */
export interface ShapeHit {
    flag: number;
    across: number;
    du: number;
    da: number;
}

// Top-down outline as a fraction of length: blunt round head, plump shoulders, narrow tail stalk.
export function bodyHalfWidth(s: number) {
    if (s < 0.12) { return 0.11 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.55); }
    if (s < 0.3) { return 0.11 + 0.025 * smoothstep(0.12, 0.3, s); }
    return 0.033 + 0.102 * (1 - smoothstep(0.3, 0.74, s));
}

const BODY_END = 0.74;

// Butterfly tail: fans out from the stalk, with a V notch in the trailing edge.
function tailHalfWidth(s: number) {
    return 0.03 + 0.15 * Math.pow(smoothstep(0.7, 1, s), 0.8);
}

/** Test a point against a fin: an ellipse leaning back from a root on the body's edge. */
function inFin(s: number, a: number, rootS: number, angle: number, reach: number, width: number, out: ShapeHit) {
    const rootA = bodyHalfWidth(rootS) * 0.85;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const du = s - rootS;
    const da = a - rootA;
    const along = du * cosA + da * sinA - reach;
    const perp = -du * sinA + da * cosA;
    if ((along / reach) ** 2 + (perp / width) ** 2 > 1) { return false; }
    out.flag = FLAG_FIN;
    out.du = du;
    out.da = da;
    return true;
}

/**
 * Classify a point given in body coordinates, all as fractions of length:
 * `s` along the spine (0 snout, 1 tail tip), `a` distance from it, and
 * `past` how far it sits beyond the tail tip. `flare` spreads the fins.
 */
export function classify(s: number, a: number, past: number, flare: number, out: ShapeHit, ahead = 0, lateral = 0) {
    out.flag = 0;
    out.across = 1;
    out.du = 1;
    out.da = 0;

    // Barbels: a short whisker angling out from each corner of the mouth, the tell that this is a koi.
    if (ahead > 0) {
        if (ahead < 0.05 && Math.abs(lateral - (0.045 + ahead * 0.7)) < 0.016) {
            out.flag = FLAG_BARBEL;
            return true;
        }
        return false;
    }

    const w = bodyHalfWidth(s);
    if (s <= BODY_END && a <= w) {
        const across = a / w;
        out.across = across;
        if (s > 0.055 && s < 0.1 && across > 0.5 && across < 0.85) { out.flag = FLAG_EYE; }
        else if (s > 0.28 && s < 0.6 && across < 0.14) { out.flag = FLAG_DORSAL; }
        else { out.flag = FLAG_BODY; }
        return true;
    }

    if (s > 0.68 && past <= 0) {
        const tw = tailHalfWidth(s) * flare;
        if (a <= tw && s <= 0.86 + 0.14 * (a / tw)) {
            out.flag = FLAG_FIN;
            out.da = (a / tw) * 0.8;
            return true;
        }
    }

    return (
        inFin(s, a, 0.19, 0.85 + 0.5 * (flare - 1), 0.066 * flare, 0.04, out) ||
        inFin(s, a, 0.47, 0.75, 0.036, 0.018, out)
    );
}
