export type Level = number;

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface TowerState {
  schemaVersion: number;
  step: number;
  rng: RngState;
  nextId: number;
}

export type EngineEvent = never;
