import { formatMoney, levelLabel, type NoticeParams } from '@tower-magnate/shared';

/** Notice params as the news texts show them: the ruler label of a level and money as text. */
export function noticeParamTexts(params: NoticeParams): Record<string, string | number> {
  const texts: Record<string, string | number> = {};
  if (params.level !== undefined) texts.level = levelLabel(params.level);
  if (params.amount !== undefined) texts.amount = formatMoney(params.amount);
  if (params.n !== undefined) texts.n = params.n;
  if (params.option !== undefined) texts.option = params.option;
  return texts;
}
