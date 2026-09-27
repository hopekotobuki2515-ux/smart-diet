import { PROGRAM, foodPoints } from './program-config.js';

export const SAMPLE_CATEGORIES = Object.freeze(['自炊','外食','コンビニ','スーパー','ファストフード']);

// Measured ingredient amounts for one illustration. No brand, recipe, cooking oil or seasoning is implied.
// Other categories require product labels and group classification before publication.
export const SELF_COOK_SAMPLE = Object.freeze([
  {meal:'朝食',name:'食パン',grams:60},
  {meal:'朝食',name:'普通牛乳',grams:120},
  {meal:'朝食',name:'バナナ',grams:95},
  {meal:'昼食',name:'めし・水稲・精白米',grams:150},
  {meal:'昼食',name:'もめん豆腐',grams:110},
  {meal:'昼食',name:'ブロッコリー',grams:120},
  {meal:'昼食',name:'にんじん',grams:110},
  {meal:'夕食',name:'めし・水稲・精白米',grams:150},
  {meal:'夕食',name:'シロサケ',grams:60},
  {meal:'夕食',name:'キャベツ',grams:175},
  {meal:'夕食',name:'にんじん',grams:110},
  {meal:'間食',name:'ヨーグルト・全脂無糖',grams:130}
]);

export function resolveSample(master) {
  const byName = new Map(master.map(food=>[food.name,food]));
  const items = SELF_COOK_SAMPLE.map(item=>{
    const match=byName.get(item.name);
    if(!match)throw new Error(`食品マスターに「${item.name}」がありません`);
    return {...item,group:match.group,points:foodPoints(item.grams,match.gramsPerPoint)};
  });
  return {items,totalPoints:Math.round(items.reduce((sum,item)=>sum+item.points,0)*100)/100,
    kcalPerPoint:PROGRAM.kcalPerPoint};
}
