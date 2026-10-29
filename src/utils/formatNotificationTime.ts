/**
 * The short time of a notification row (Notifications spec §5.3): «now», «10 min», «2 h»,
 * «yesterday», «Oct 22», «Oct 22, 2025». Pure — the caller passes `now` and refreshes it on tab
 * focus and `AppState → active`, so no timer is needed. Month names are tables here rather than
 * `Intl`, which Hermes may ship without locale data.
 */

type Lang = 'en' | 'ru' | 'uk';

const MONTHS: Record<Lang, string[]> = {
  en: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
  ru: [
    'янв',
    'фев',
    'мар',
    'апр',
    'мая',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ],
  uk: [
    'січ',
    'лют',
    'бер',
    'кві',
    'тра',
    'чер',
    'лип',
    'сер',
    'вер',
    'жов',
    'лис',
    'гру',
  ],
};

const WORDS: Record<
  Lang,
  { now: string; min: string; hour: string; yesterday: string }
> = {
  en: { now: 'now', min: 'min', hour: 'h', yesterday: 'yesterday' },
  ru: { now: 'сейчас', min: 'мин', hour: 'ч', yesterday: 'вчера' },
  uk: { now: 'зараз', min: 'хв', hour: 'год', yesterday: 'вчора' },
};

const MINUTE = 60_000;

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatNotificationTime(
  createdAt: string | Date,
  now: Date,
  lang: string,
): string {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';

  const l: Lang = lang === 'ru' || lang === 'uk' ? lang : 'en';
  const w = WORDS[l];

  // A clock a little ahead of the server must not print a negative age.
  const age = Math.max(0, now.getTime() - created.getTime());
  const minutes = Math.floor(age / MINUTE);
  if (minutes < 1) return w.now;
  if (minutes < 60) return `${minutes} ${w.min}`;

  // Calendar days, not 24-hour spans: 00:10 is «yesterday» for something sent at 23:50.
  const days = Math.round((dayStart(now) - dayStart(created)) / 86_400_000);
  if (days <= 0) return `${Math.floor(minutes / 60)} ${w.hour}`;
  if (days === 1) return w.yesterday;

  const month = MONTHS[l][created.getMonth()];
  const date =
    l === 'en'
      ? `${month} ${created.getDate()}`
      : `${created.getDate()} ${month}`;
  if (created.getFullYear() === now.getFullYear()) return date;
  return l === 'en'
    ? `${date}, ${created.getFullYear()}`
    : `${date} ${created.getFullYear()}`;
}
