/**
 * Game configuration. TICK_HZ is the ONLY place tick rate is defined —
 * everything else derives from it (see CONVENTIONS.md #2).
 */
export const TICK_HZ = 30; // set during SETUP.md interview
export const TICK_MS = 1000 / TICK_HZ;
export const SCHEMA_VERSION = 1; // bump when state/input/replay shapes change
