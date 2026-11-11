import { parseJsonText, parseRecipes } from './core.js';

const repository = 'Jealfe/moya-kuhnya';
const folder = 'recipes-inbox';
const branch = 'main';
const listing = 'https://api.github.com/repos/'+repository+'/contents/'+folder+'?ref='+branch;
const raw = 'https://raw.githubusercontent.com/'+repository+'/'+branch+'/'+folder+'/';
const maxBytes = 10*1024*1024;

async function gitBlobHash(bytes) {
  const header = new TextEncoder().encode('blob '+bytes.length+'\0');
  const blob = new Uint8Array(header.length+bytes.length);
  blob.set(header);
  blob.set(bytes,header.length);
  const digest = await crypto.subtle.digest('SHA-1',blob);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function statusError(response,description) {
  if (response.status === 403 || response.status === 429) {
    return Error('GitHub временно ограничил количество проверок. Попробуйте позже.');
  }
  return Error(description+' (HTTP '+response.status+').');
}

async function fetchBytes(url,cache,fetchFile) {
  let response;
  try {
    response = await fetchFile(url,{cache,signal:AbortSignal.timeout(15000)});
  } catch {
    throw Error('Файл не загрузился. Проверьте подключение к интернету.');
  }
  if (!response.ok) throw statusError(response,'Файл не загрузился');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length>maxBytes) throw Error('Файл больше 10 МБ.');
  return bytes;
}

async function readRecipeFile(entry,recipeSchema,bundleSchema,fetchFile) {
  if (!Number.isInteger(entry.size) || entry.size<0 || entry.size>maxBytes) throw Error('Файл больше 10 МБ или его размер неизвестен.');
  if (!/^[a-f0-9]{40}$/.test(entry.sha)) throw Error('GitHub не сообщил версию файла.');
  const url = raw+encodeURIComponent(entry.name)+'?v='+entry.sha;
  let bytes = await fetchBytes(url,'force-cache',fetchFile);
  if (await gitBlobHash(bytes)!==entry.sha) {
    bytes = await fetchBytes(url,'reload',fetchFile);
    if (await gitBlobHash(bytes)!==entry.sha) throw Error('Файл изменился во время проверки. Попробуйте ещё раз.');
  }
  return parseRecipes(parseJsonText(new TextDecoder().decode(bytes)),recipeSchema,bundleSchema);
}

export async function readRecipeInbox(recipeSchema,bundleSchema,fetchFile=globalThis.fetch) {
  let response;
  try {
    response = await fetchFile(listing,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  } catch {
    throw Error('Не удалось связаться с GitHub. Проверьте подключение к интернету и повторите проверку.');
  }
  if (!response.ok) throw statusError(response,'Папка рецептов GitHub недоступна');
  const entries = await response.json();
  if (!Array.isArray(entries)) throw Error('GitHub вернул список файлов в неизвестном формате.');
  const files = entries.filter(entry=>entry?.type==='file' && typeof entry.name==='string' &&
    /\.json$/i.test(entry.name) && !/[\\/]/.test(entry.name));
  const recipes = [];
  const issues = [];
  for (let i=0;i<files.length;i+=4) {
    const group=files.slice(i,i+4);
    const result=await Promise.allSettled(group.map(file=>readRecipeFile(file,recipeSchema,bundleSchema,fetchFile)));
    result.forEach((item,index)=>{
      if (item.status==='fulfilled') recipes.push(...item.value);
      else issues.push({name:group[index].name,message:String(item.reason?.message ?? item.reason).split('\n')[0]});
    });
  }
  return {recipes,issues};
}

export function addInboxRecipes(state,builtins,recipes) {
  const known = new Set([...builtins,...state.recipes].map(recipe=>recipe.id));
  let added=0, existing=0, overLimit=0;
  for (const recipe of recipes) {
    if (known.has(recipe.id)) {existing++; continue;}
    known.add(recipe.id);
    if (state.recipes.length>=1000) {overLimit++; continue;}
    state.recipes.push(recipe);
    added++;
  }
  return {added,existing,overLimit};
}
