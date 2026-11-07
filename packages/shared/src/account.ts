import type { AuthUser } from './auth';

export interface TowerDate {
  year: number;
  month: number;
  day: number;
  /** 0 for Monday, 6 for Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

export interface TowerSummary {
  id: number;
  step: number;
  date: TowerDate;
  money: number;
  unitCount: number;
  createdAt: string;
}

export interface AccountResponse {
  user: AuthUser;
  tower: TowerSummary | null;
}

export interface TowerResponse {
  tower: TowerSummary;
}

export interface TowerResetRequest {
  confirm: true;
}
