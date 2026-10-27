/** Ambient koi simulation adapted from the supplied analizar/koi-pond reference. */
export const TAU = Math.PI * 2;
export const KOI_NODES = 20;

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const rand = (low: number, high: number) => low + Math.random() * (high - low);

export function smoothstep(low: number, high: number, value: number) {
	const t = clamp((value - low) / (high - low), 0, 1);
	return t * t * (3 - 2 * t);
}

function angleDiff(a: number, b: number) {
	let delta = (b - a) % TAU;
	if (delta > Math.PI) { delta -= TAU; }
	if (delta < -Math.PI) { delta += TAU; }
	return delta;
}

/** Stable texture coordinates keep the character tiles attached to each body. */
export function hash3(x: number, y: number, z: number) {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

export type Box = { left: number; top: number; right: number; bottom: number };
type Variety = 'kohaku' | 'sanke' | 'tancho' | 'gray-yellow';

export interface Koi {
	id: number;
	variety: Variety;
	length: number;
	nodes: Float32Array;
	heading: number;
	speed: number;
	phase: number;
	turn: number;
	wander: number;
	depth: number;
	depthTarget: number;
	nextDive: number;
	beat: number;
	burstUntil: number;
	nextBurst: number;
	finPhase: number;
}

export class World {
	width = 0;
	height = 0;
	time = 0;
	koi: Koi[] = [];
	avoid: Box[] = [];

	resize(width: number, height: number) {
		const previousWidth = this.width;
		const previousHeight = this.height;
		this.width = width;
		this.height = height;
		const count = 3;
		const baseLength = clamp(Math.min(width, height) * 0.46, 125, 340);
		for (const fish of this.koi) {
			// Preserve the school through panel resizes, including its body proportions.
			const x = fish.nodes[0] * width / previousWidth;
			const y = fish.nodes[1] * height / previousHeight;
			const length = baseLength * this.size(fish.id);
			const scale = length / fish.length;
			for (let n = KOI_NODES - 1; n >= 0; n--) {
				fish.nodes[n * 2] = x + (fish.nodes[n * 2] - fish.nodes[0]) * scale;
				fish.nodes[n * 2 + 1] = y + (fish.nodes[n * 2 + 1] - fish.nodes[1]) * scale;
			}
			fish.length = length;
		}
		this.koi.length = Math.min(this.koi.length, count);
		while (this.koi.length < count) {
			const id = this.koi.length + 1;
			const length = baseLength * this.size(id);
			const heading = id === 3 ? rand(-0.25, 0.25) : rand(0, TAU);
			// Start around the perimeter, leaving the launcher readable from the first frame.
			const x = width * (id === 3 ? rand(0.55, 0.75) : id % 2 ? rand(0.08, 0.26) : rand(0.74, 0.92));
			const y = height * (id === 3 ? rand(0.1, 0.18) : id % 2 ? rand(0.12, 0.32) : rand(0.68, 0.88));
			const nodes = new Float32Array(KOI_NODES * 2);
			for (let n = 0; n < KOI_NODES; n++) {
				const distance = length * n / (KOI_NODES - 1);
				nodes[n * 2] = x - Math.cos(heading) * distance;
				nodes[n * 2 + 1] = y - Math.sin(heading) * distance;
			}
			this.koi.push({
				id, variety: id === 3 ? 'gray-yellow' : id % 2 ? 'kohaku' : 'sanke', length, nodes,
				heading, speed: 20, phase: rand(0, TAU), turn: 0, wander: 0,
				depth: rand(0.6, 1), depthTarget: rand(0.6, 1), nextDive: this.time + rand(6, 18),
				beat: 0.5, burstUntil: this.time + 1, nextBurst: this.time + rand(2, 4), finPhase: rand(0, TAU)
			});
		}
	}

	step(dt: number) {
		this.time += dt;
		for (const fish of this.koi) { this.swim(fish, dt); }
	}

	private size(id: number) {
		if (id === 2) { return 0.95; }
		if (id === 3) { return 0.5; }
		return 0.72 + hash3(id, 1, 5) * 0.28;
	}

	private swim(k: Koi, dt: number) {
		const { nodes, length } = k;
		const hx = nodes[0];
		const hy = nodes[1];
		k.wander = clamp(k.wander + (Math.random() - 0.5) * dt * 2.4, -0.9, 0.9);
		let dx = Math.cos(k.heading) + Math.cos(k.heading + k.wander) * 0.6;
		let dy = Math.sin(k.heading) + Math.sin(k.heading + k.wander) * 0.6;

		for (const other of this.koi) {
			if (other === k) { continue; }
			const ox = hx - other.nodes[0];
			const oy = hy - other.nodes[1];
			const distance = Math.hypot(ox, oy);
			const range = (length + other.length) * 0.3;
			if (distance > 0 && distance < range) {
				const weight = (1 - distance / range) * 2.4 / distance;
				dx += ox * weight;
				dy += oy * weight;
			} else if (distance < length * 1.6) {
				dx += Math.cos(other.heading) * 0.18;
				dy += Math.sin(other.heading) * 0.18;
			}
		}

		for (const box of this.avoid) {
			let ox = hx - clamp(hx, box.left, box.right);
			let oy = hy - clamp(hy, box.top, box.bottom);
			const distance = Math.hypot(ox, oy);
			const margin = length * 0.35;
			if (distance >= margin) { continue; }
			if (distance < 0.001) {
				const horizontal = Math.min(hx - box.left, box.right - hx);
				const vertical = Math.min(hy - box.top, box.bottom - hy);
				ox = horizontal <= vertical ? (hx - box.left < box.right - hx ? -1 : 1) : 0;
				oy = horizontal > vertical ? (hy - box.top < box.bottom - hy ? -1 : 1) : 0;
			}
			const weight = (1 - distance / margin) * 1.8 / (Math.hypot(ox, oy) || 1);
			dx += ox * weight;
			dy += oy * weight;
		}

		const over = Math.max(-hx, hx - this.width, -hy, hy - this.height);
		if (over > -length * 0.25) {
			const weight = clamp((over + length * 0.25) / (length * 0.5), 0, 1) * 3.5;
			const ox = this.width / 2 - hx;
			const oy = this.height / 2 - hy;
			const distance = Math.hypot(ox, oy) || 1;
			dx += ox / distance * weight;
			dy += oy / distance * weight;
		}

		const maxTurn = Math.min(0.7, k.speed / length * 4) * dt;
		const turned = clamp(angleDiff(k.heading, Math.atan2(dy, dx)), -maxTurn, maxTurn);
		k.heading += turned;
		k.turn += (turned / dt - k.turn) * Math.min(1, dt * 3);
		if (this.time > k.nextBurst) {
			k.burstUntil = this.time + rand(0.7, 1.6);
			k.nextBurst = k.burstUntil + rand(1.2, 4);
		}
		const bursting = this.time < k.burstUntil;
		k.beat += ((bursting ? 1 : 0) - k.beat) * Math.min(1, dt * 3);
		const target = (12 + length * 0.05) * (bursting ? 1.35 : 0.45);
		k.speed += (target - k.speed) * Math.min(1, dt * (bursting ? 1.6 : 0.35));
		k.phase += dt * (0.6 + k.beat * (2.2 + k.speed / 11));
		k.finPhase += dt * 2.4;
		if (this.time > k.nextDive) {
			k.depthTarget = rand(0.6, 1);
			k.nextDive = this.time + rand(8, 20);
		}
		k.depth += (k.depthTarget - k.depth) * Math.min(1, dt * 0.15);
		nodes[0] += Math.cos(k.heading) * k.speed * dt;
		nodes[1] += Math.sin(k.heading) * k.speed * dt;
		const segment = length / (KOI_NODES - 1);
		let previousAngle = k.heading + Math.PI;
		for (let n = 1; n < KOI_NODES; n++) {
			const x = nodes[(n - 1) * 2];
			const y = nodes[(n - 1) * 2 + 1];
			const desired = Math.atan2(nodes[n * 2 + 1] - y, nodes[n * 2] - x);
			const angle = previousAngle + clamp(angleDiff(previousAngle, desired), -0.16, 0.16);
			nodes[n * 2] = x + Math.cos(angle) * segment;
			nodes[n * 2 + 1] = y + Math.sin(angle) * segment;
			previousAngle = angle;
		}
	}
}
