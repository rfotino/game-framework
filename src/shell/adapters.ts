/**
 * Platform adapter interfaces. Sim code never imports this package.
 * Implementations: PixiJS renderer, howler audio, browser input, debug panel.
 * On a future port these are reimplemented per platform; the sim core is not.
 */

import type { InputFrame, Params, SimState } from "../engine/game.js";

/**
 * Visual manifest: entity type -> visual description. Asset tier upgrades
 * (shapes -> Kenney -> custom art) only ever edit this file, never game code.
 */
/**
 * One stroked subpath in normalized entity-local space: coordinates within
 * [-1, 1], the renderer multiplying by a pixel radius. Authored art (an SVG) is
 * extracted into these, so an art upgrade edits the source file and the
 * regenerated manifest, never game code.
 */
export interface StrokePolyline {
  /** Flat point list `[x0, y0, x1, y1, …]`. */
  points: number[];
  /** Whether the subpath closes back on its first point (SVG `Z`). */
  closed: boolean;
  /** Stroke width, in the SAME normalized units as the points. */
  width: number;
}

export type Visual =
  | { kind: "rect"; w: number; h: number; color: number }
  | { kind: "circle"; r: number; color: number }
  | { kind: "sprite"; sheet: string; frame: string; scale?: number }
  | { kind: "animated"; sheet: string; anim: string; fps: number; scale?: number }
  /**
   * Stroked vector paths — the line-art / neon look, where the path data IS the
   * asset rather than a reference for one. `bloom` is a hint in [0, 1] the
   * renderer maps onto its own glow treatment (0 = flat stroke, 1 = full
   * additive bloom); a game with a reserved-vs-decorative color system reads it
   * as the tier. `color` is omitted when the renderer supplies it per entity
   * (team or identity color), which keeps the manifest entry shape-only.
   */
  | { kind: "path"; polylines: StrokePolyline[]; color?: number; bloom?: number };

export type VisualManifest = Record<string, Visual>;

export interface Renderer<S extends SimState> {
  init(canvas: HTMLCanvasElement, manifest: VisualManifest): Promise<void>;
  /**
   * Draw between two sim states. alpha in [0,1) = fraction of a tick elapsed;
   * interpolate positions. This is why tick rate stays a free variable.
   * Cosmetic randomness uses the renderer's OWN Rng, never the sim stream.
   */
  draw(prev: S, curr: S, alpha: number): void;
  destroy(): void;
}

export interface AudioAdapter {
  init(manifest: Record<string, string>): Promise<void>; // soundId -> url
  play(soundId: string, opts?: { volume?: number; rate?: number }): void;
  music(trackId: string | null): void;
}

/**
 * Input adapter: samples device state into the game's InputFrame once per tick.
 * Bindings live here so gamepad/touch/keyboard are swappable per platform.
 */
export interface InputAdapter<I extends InputFrame> {
  attach(target: HTMLElement): void;
  /** Called by the game loop exactly once per sim tick. */
  sample(tick: number): I;
  detach(): void;
}

export interface DebugPanel<P extends Params> {
  /**
   * Auto-generate sliders/toggles from the params object (recursing into
   * nested groups). onChange fires between ticks; the loop swaps params in
   * ctx so the designer feels changes live without a rebuild.
   */
  mount(params: P, onChange: (next: P) => void): void;
  /** Extra readouts: fps, tick, entity counts, current seed, replay controls. */
  setStats(stats: Record<string, string | number>): void;
  unmount(): void;
}
