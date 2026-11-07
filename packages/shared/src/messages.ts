export const NEWS_IDS = [
  'news.shopLeftNoCustomers',
  'news.officeLeft',
  'news.shopLeftEvaluation',
  'news.condoBuyback',
  'news.cinemaChangeFilm',
  'news.cinemaLowAudience',
  'news.fastFoodLoss',
  'news.restaurantLoss',
  'news.partyHallEmpty',
  'news.upkeepNegative',
  'news.balanceNegative',
  'news.medicalDemanded',
  'news.medicalFull',
  'news.parkingOffice',
  'news.parkingCondo',
  'news.parkingSuite',
  'news.cockroaches',
  'news.starsUp',
  'news.starBlockedSecurity',
  'news.starBlockedVip',
  'news.starBlockedSuites',
  'news.starBlockedRecycling',
  'news.starBlockedMedical',
  'news.starBlockedParking',
  'news.starBlockedSubway',
  'news.towerRank',
  'news.weddingFailed',
  'news.bombThreat',
  'news.bombPaid',
  'news.bombSearch',
  'news.bombFound',
  'news.bombExploded',
  'news.fire',
  'news.fireHelicopter',
  'news.fireOut',
  'news.vipArrives',
  'news.vipNoSuite',
  'news.vipApproved',
  'news.vipRejected',
  'news.treasure',
  'news.santa',
  'news.decisionDefault',
] as const;

export const DIALOG_MESSAGE_IDS = [
  'dialog.bomb.title',
  'dialog.bomb.body',
  'dialog.bomb.pay',
  'dialog.bomb.refuse',
  'dialog.fire.title',
  'dialog.fire.body',
  'dialog.fire.helicopter',
  'dialog.fire.burn',
  'dialog.deadlineToday',
  'dialog.deadlineOtherDay',
  'dialog.starsUp.title',
  'dialog.starsUp.body',
  'dialog.towerRank.title',
  'dialog.towerRank.body',
  'dialog.welcome.title',
  'dialog.welcome.body',
  'dialog.demolishSoldCondo.title',
  'dialog.demolishSoldCondo.body',
  'dialog.demolishExpensive.title',
  'dialog.demolishExpensive.body',
  'dialog.demolish',
  'dialog.changeFilm.title',
  'dialog.changeFilm.body',
  'dialog.changeFilm.confirm',
  'dialog.newTower.title',
  'dialog.newTower.body',
  'dialog.newTower.confirm',
  'dialog.protocolMismatch.body',
  'dialog.protocolMismatch.reload',
  'dialog.connecting.body',
  'dialog.connectionLost.body',
] as const;

export const MESSAGE_IDS = [...NEWS_IDS, ...DIALOG_MESSAGE_IDS] as const;

export type NewsId = (typeof NEWS_IDS)[number];
export type DialogMessageId = (typeof DIALOG_MESSAGE_IDS)[number];
export type MessageId = (typeof MESSAGE_IDS)[number];

export type NewsScope = 'tower' | 'unit' | 'level' | 'event';

export interface NewsRule {
  alert: boolean;
  scope: NewsScope;
  minGapMinutes: number;
  oncePerDay: boolean;
}

export const NEWS_MIN_GAP_MINUTES = 60;

function rule(scope: NewsScope, options: { alert?: boolean; oncePerDay?: boolean } = {}): NewsRule {
  return {
    alert: options.alert ?? false,
    scope,
    minGapMinutes: NEWS_MIN_GAP_MINUTES,
    oncePerDay: options.oncePerDay ?? false,
  };
}

const alert = { alert: true };
const daily = { oncePerDay: true };

export const NEWS_RULES: Record<NewsId, NewsRule> = {
  'news.shopLeftNoCustomers': rule('unit'),
  'news.officeLeft': rule('unit'),
  'news.shopLeftEvaluation': rule('unit'),
  'news.condoBuyback': rule('unit'),
  'news.cinemaChangeFilm': rule('unit'),
  'news.cinemaLowAudience': rule('unit'),
  'news.fastFoodLoss': rule('unit'),
  'news.restaurantLoss': rule('unit'),
  'news.partyHallEmpty': rule('unit'),
  'news.upkeepNegative': rule('tower', alert),
  'news.balanceNegative': rule('tower', alert),
  'news.medicalDemanded': rule('tower', daily),
  'news.medicalFull': rule('tower', daily),
  'news.parkingOffice': rule('tower', daily),
  'news.parkingCondo': rule('tower', daily),
  'news.parkingSuite': rule('tower', daily),
  'news.cockroaches': rule('level', alert),
  'news.starsUp': rule('tower'),
  'news.starBlockedSecurity': rule('tower', alert),
  'news.starBlockedVip': rule('tower', alert),
  'news.starBlockedSuites': rule('tower', alert),
  'news.starBlockedRecycling': rule('tower', alert),
  'news.starBlockedMedical': rule('tower', alert),
  'news.starBlockedParking': rule('tower', alert),
  'news.starBlockedSubway': rule('tower', alert),
  'news.towerRank': rule('tower'),
  'news.weddingFailed': rule('tower'),
  'news.bombThreat': rule('event', alert),
  'news.bombPaid': rule('event'),
  'news.bombSearch': rule('event'),
  'news.bombFound': rule('event'),
  'news.bombExploded': rule('event', alert),
  'news.fire': rule('event', alert),
  'news.fireHelicopter': rule('event'),
  'news.fireOut': rule('event'),
  'news.vipArrives': rule('event'),
  'news.vipNoSuite': rule('event'),
  'news.vipApproved': rule('event'),
  'news.vipRejected': rule('event'),
  'news.treasure': rule('level'),
  'news.santa': rule('tower'),
  'news.decisionDefault': rule('event'),
};
