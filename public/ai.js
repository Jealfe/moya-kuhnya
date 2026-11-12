import { parseJsonText, validate } from './core.js';

// Whitelists are deliberate: photos, credentials, unrelated dishes and app settings
// never enter the model context or its fingerprint.
export const reviewData = entry => Object.fromEntries(['rating','good','errors','next','again','minutes','servings'].map(key=>[key,entry[key]??'']));
export const recipeData = recipe => ({
  id:recipe.id,name:recipe.name,description:recipe.description,servings:recipe.servings,
  ingredients:recipe.ingredients.map(({name,quantity,unit})=>({name,quantity,unit})),
  steps:recipe.steps.map(({title,instruction,temperature,timers,ready},index)=>({index,title,instruction,temperature,timers,ready}))
});
export const recipeForEntry = (entry,recipe) => entry.recipeSnapshot??recipe;
function canonical(value) {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export async function fingerprint(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export function parseAnalysis(text,schema,stepCount=45) {
  let result;
  try {
    result=typeof text==='string'?parseJsonText(text):structuredClone(text);
    // Some responses contain a JSON string containing the actual object. Unwrap
    // at most once, then apply exactly the same schema and step validation.
    if (typeof result==='string') result=parseJsonText(result);
  } catch {
    const error=Error('ИИ вернул невалидный JSON. Повторите анализ по кнопке.');
    // Only the model's text, never the API response/headers/key. Kept transiently
    // for the on-device error details, not saved to state, backups or logs.
    if (typeof text==='string') error.analysisResponse=text.slice(0,12000);
    throw error;
  }
  const errors=validate(result,schema);
  if (errors.length || result.issues.some(issue=>new Set(issue.stepIndexes).size!==issue.stepIndexes.length || issue.stepIndexes.some(index=>index>=stepCount))) {
    const error=Error('Ответ ИИ не соответствует схеме или ссылается на неизвестный шаг. Повторите анализ по кнопке.');
    if (typeof text==='string') error.analysisResponse=text.slice(0,12000);
    throw error;
  }
  return result;
}
export const latestAnalysis = (state,entryId) => [...(state.aiAnalyses??[])].filter(item=>item.entryId===entryId).sort((a,b)=>b.at-a.at)[0];
export async function analysisStale(record,entry,recipe) {
  return record.reviewHash!==await fingerprint(reviewData(entry)) || !recipe || record.recipeHash!==await fingerprint(recipeData(recipe));
}
export async function buildAnalysisContext(recipe,entry,state) {
  const previous=state.history.filter(item=>item.recipeId===entry.recipeId && item.id!==entry.id && !item.pending && item.at<=entry.at)
    .sort((a,b)=>b.at-a.at).slice(0,3);
  const context={recipe:recipeData(recipe),currentAttempt:{id:entry.id,...reviewData(entry)},previousAttempts:[]};
  for (const attempt of previous) {
    const analysis=latestAnalysis(state,attempt.id);
    context.previousAttempts.push({at:attempt.at,...reviewData(attempt),
      ...(analysis?{previousAnalysis:analysis.result,feedback:analysis.feedback,possiblyOutdated:await analysisStale(analysis,attempt,recipe)}:{})});
  }
  // Drop older attempts first; never cut a JSON document in the middle.
  while (JSON.stringify(context).length>38000 && context.previousAttempts.length) context.previousAttempts.pop();
  if (JSON.stringify(context).length>38000) throw Error('Этот рецепт и отзыв слишком велики для одного анализа (лимит 38 000 символов).');
  return context;
}
export async function createAnalysis({recipe,entry,state,schema,request,now=Date.now}) {
  const recipeHash=await fingerprint(recipeData(recipe)),reviewHash=await fingerprint(reviewData(entry));
  const payload=await buildAnalysisContext(recipe,entry,state);
  const response=await request({payload});
  return {id:crypto.randomUUID(),recipeId:entry.recipeId,entryId:entry.id,at:now(),recipeHash,reviewHash,
    result:parseAnalysis(response.content,schema,recipe.steps.length),feedback:[]};
}
export function storeAnalysis(state,record) {
  if (!state.history.some(entry=>entry.id===record.entryId && entry.recipeId===record.recipeId && !entry.pending)) throw Error('Отзыв уже удалён или изменён.');
  state.aiAnalyses=[...(state.aiAnalyses??[]).filter(item=>item.entryId!==record.entryId),record];
}
export async function currentAdvice(state,recipe) {
  if (!recipe) return null;
  // The latest analysed attempt supersedes older advice; do not merge an endless list.
  const record=[...(state.aiAnalyses??[])].filter(item=>item.recipeId===recipe.id).sort((a,b)=>b.at-a.at)[0];
  if (!record) return null;
  const entry=state.history.find(item=>item.id===record.entryId);
  if (!entry || await analysisStale(record,entry,recipe)) return null;
  return record;
}
export function adviceForStep(record,index) {
  if (!record) return [];
  return record.result.issues.flatMap((issue,i)=>issue.stepIndexes.includes(index)?issue.recommendations.map((text,j)=>({text,issueIndex:i,recommendationIndex:j,
    ...record.feedback.find(item=>item.issueIndex===i && item.recommendationIndex===j)})).filter(item=>!item.done):[]).slice(0,5);
}
