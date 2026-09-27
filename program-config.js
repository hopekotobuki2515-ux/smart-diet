export const PROGRAM = Object.freeze({
  weeks: 12,
  kcalPerPoint: 80,
  dailyPoints: Object.freeze({ female: 15, male: 21 }),
  goalPercents: Object.freeze([5, 8, 10, 15]),
});

export const WEEK_TITLES = Object.freeze([
  'まず今の自分を知ろう', '3か月後の目標を決めよう', '食事の点数の見方を知ろう',
  '食べる量を見てみよう', '1食の点数を見てみよう', '1日の食事を組み立てよう',
  '食事のバランスを整えよう', '外食やコンビニでも上手に選ぼう',
  '間食や体重が減りにくい時とうまく付き合おう', '食事と運動を一緒に整えよう',
  '自分で1日の食事を考えてみよう', '3か月を振り返ってこれからにつなげよう',
]);

export const WEEK_SOURCES = Object.freeze([
  '1LVIk-5J_Z97zD6VAseTwcAlfQibDiMibGe9RZSB76gk',
  '1CwIH-oCFq5Cqfwes_z7YpF3jp94Z_zoPXnAURZAWYfc',
  '1bQki2kstGn0CHlPEl8TMDhpAmvI4QWB8E0q9GMyDa7Y',
  '1cOyq5Wh8e8J0XnsxK4iSwskups2SsnX0nCmWJzCRtqI',
  '1v1rvv9Ie4kxr4julaLCcC04orpkLw8SaqelYT3_ZUZg',
  '1GS0VJ9Qkp5IlV6ISiFswTWLnto-oo1zKaMQlC46SLBo',
  '1oyJPh3slnCXrhXJhdVvJO_tg7kEvy5P59ufnWqJnIqA',
  '1F0x4PzGktkLccjFJT01eCghB5SPOUm3VuQNfiyGE-ek',
  '1AQ1onqsSOKrDLb62Skdyf3WiHX3rZ8mJrqeX3iVaSEo',
  '13OzZTqZU0-_FcBjHHGULKvMeJoOdi-4KR4n2wND0pgI',
  '1CuFim1XAIbZERUgkO4FfMNjRjle2HBFtFarXJEfZmMs',
  '1hTU3ij64MeM_yL-kBs8GA3I9cC-HqJK0D2wdNi2qRJs',
]);

export function goalWeight(startWeight, percent) {
  if (!Number.isFinite(startWeight) || startWeight <= 0 || !PROGRAM.goalPercents.includes(percent)) throw new RangeError('目標の値を確認してください');
  return Math.round(startWeight * (1 - percent / 100) * 10) / 10;
}

export function bmi(heightCm, weightKg) {
  if (!Number.isFinite(heightCm) || heightCm <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) throw new RangeError('身長・体重を確認してください');
  return Math.round(weightKg / (heightCm / 100) ** 2 * 10) / 10;
}

export function currentWeek(startDate, now = new Date()) {
  const start = new Date(`${startDate}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return 1;
  const elapsed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
  return Math.min(PROGRAM.weeks, Math.floor(elapsed / 7) + 1);
}

export function foodPoints(grams, gramsPerPoint) {
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(gramsPerPoint) || gramsPerPoint <= 0) throw new RangeError('食品の量を確認してください');
  return Math.round(grams / gramsPerPoint * 100) / 100;
}
