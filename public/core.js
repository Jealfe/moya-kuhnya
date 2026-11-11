export const formatNumber = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format;
export const uid = () => globalThis.crypto.randomUUID();
export const totalTime = recipe => recipe.prep + recipe.cook;
export const initialState = () => ({
  recipes:[], favorites:[], statuses:[], planned:null, shopping:[], shoppingBatches:[], history:[], session:null,
  settings:{theme:'dark',sound:true,wake:true}, goals:{monthly:0,new:0,retry:0}
});

export function validate(value, schema, path='$', errors=[]) {
  if (errors.length >= 25) return errors;
  if (schema.anyOf) {
    if (!schema.anyOf.some(option => validate(value,option,path,[]).length === 0)) errors.push(path+' — недопустимое значение');
    return errors;
  }
  const fail = message => errors.push(path+' — '+message);
  if ('const' in schema && value !== schema.const) fail('ожидается '+schema.const);
  if (schema.enum && !schema.enum.includes(value)) fail('допустимо: '+schema.enum.join(', '));
  const matches = {
    object: () => value !== null && typeof value === 'object' && !Array.isArray(value),
    array: () => Array.isArray(value),
    number: () => typeof value === 'number' && Number.isFinite(value),
    integer: () => Number.isSafeInteger(value),
    string: () => typeof value === 'string',
    boolean: () => typeof value === 'boolean',
    null: () => value === null
  };
  if (!schema.type) return errors;
  if (!matches[schema.type]()) { fail('неверный тип поля ('+schema.type+')'); return errors; }
  if (schema.type === 'object') {
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value,name)) errors.push(path+'.'+name+' — обязательное поле');
    }
    for (const [name,item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties,name)) validate(item,schema.properties[name],path+'.'+name,errors);
      else if (schema.additionalProperties === false) errors.push(path+'.'+name+' — неизвестное поле');
      if (errors.length >= 25) break;
    }
  }
  if (schema.type === 'array') {
    if (value.length < schema.minItems || value.length > schema.maxItems) fail('допустимо элементов: '+schema.minItems+'–'+schema.maxItems);
    value.slice(0,schema.maxItems).forEach((item,index) => validate(item,schema.items,path+'['+(index+1)+']',errors));
  }
  if (schema.type === 'string') {
    if (value.trim().length < (schema.minLength ?? 0)) fail('заполните поле');
    if (value.length > schema.maxLength) fail('максимум '+schema.maxLength+' символов');
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('неверный формат');
  }
  if ((schema.type === 'number' || schema.type === 'integer') && (value < schema.minimum || value > schema.maximum)) {
    fail('допустимый диапазон '+schema.minimum+'–'+schema.maximum);
  }
  return errors;
}

export function recipeLinks(recipe,path='$') {
  const ids = new Set(recipe.ingredients.map(item => item.id));
  const errors = [];
  if (ids.size !== recipe.ingredients.length) errors.push(path+'.ingredients — ID должны быть уникальны');
  recipe.steps.forEach((step,index) => {
    if (new Set(step.ingredients).size !== step.ingredients.length || step.ingredients.some(id => !ids.has(id))) {
      errors.push(path+'.steps['+(index+1)+'].ingredients — укажите существующие ID без повторов');
    }
  });
  return errors;
}

function checked(errors) {
  if (errors.length) throw new Error(errors.slice(0,25).join('\n'));
}

export function parseJsonText(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  try { return JSON.parse(fenced ? fenced[1] : trimmed); }
  catch { throw Error('Не удалось прочитать JSON. Проверьте синтаксис.'); }
}
export function parseRecipes(value, recipeSchema, bundleSchema) {
  if (value?.format === 'moya-kuhnya-recipes') {
    checked(validate(value,bundleSchema));
    checked(value.recipes.flatMap((recipe,index)=>recipeLinks(recipe,'$.recipes['+(index+1)+']')));
    return value.recipes;
  }
  checked(validate(value,recipeSchema));
  checked(recipeLinks(value));
  return [value];
}

export function parseBackup(value,schema,legacySchema) {
  const legacy = value?.version === 1;
  checked(validate(value,legacy ? legacySchema : schema));
  const data = legacy ? {...value.data,shoppingBatches:[]} : value.data;
  const errors = data.recipes.flatMap((recipe,index)=>recipeLinks(recipe,'$.data.recipes['+(index+1)+']'));
  for (const [key, records] of Object.entries({recipes:data.recipes, statuses:data.statuses, shopping:data.shopping, history:data.history})) {
    if (new Set(records.map(item=>item.id)).size !== records.length) errors.push('$.data.'+key+' — повторяются ID');
  }
  if (new Set(data.shoppingBatches.map(batch=>batch.id)).size !== data.shoppingBatches.length) {
    errors.push('$.data.shoppingBatches — повторяются ID блюд');
  }
  const items = shoppingSections(data).flatMap(section=>section.items);
  if (new Set(items.map(item=>item.id)).size !== items.length) errors.push('$.data.shoppingBatches — повторяются ID продуктов');
  if (data.session) {
    const {recipe,step,done,timers} = data.session;
    errors.push(...recipeLinks(recipe,'$.data.session.recipe'));
    if (step >= recipe.steps.length || done.some(index=>index >= recipe.steps.length)) errors.push('$.data.session — неверный номер шага');
    if (new Set(timers.map(timer=>timer.id)).size !== timers.length) errors.push('$.data.session.timers — повторяются ID');
  }
  checked(errors);
  return data;
}

export const scaled = (ingredients, servings, original) =>
  ingredients.map(item => ({...item,quantity:item.quantity*servings/original}));

const units = new Map([
  ['г',['г',1]],['грамм',['г',1]],['граммов',['г',1]],['кг',['г',1000]],['килограмм',['г',1000]],['килограммов',['г',1000]],
  ['мл',['мл',1]],['л',['мл',1000]],['литр',['мл',1000]],['литров',['мл',1000]],['шт',['шт.',1]],['штука',['шт.',1]],['штук',['шт.',1]],
  ['ч л',['ч. л.',1]],['ст л',['ч. л.',3]]
]);
const clean = value => value.trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
function convert(item) {
  const key = clean(item.unit).replace(/\./g,'').replace(/\s+/g,' ');
  const [unit,multiplier] = units.get(key) ?? [item.unit.trim(),1];
  return {...item,unit,quantity:item.quantity*multiplier};
}
export function addShopping(list, ingredients, makeId=uid) {
  const result = list.map(item=>({...item}));
  for (const input of ingredients) {
    const item = convert(input);
    const existing = result.find(current => current.state === 'todo' && clean(current.name) === clean(item.name) && clean(convert(current).unit) === clean(item.unit));
    if (existing) {
      existing.quantity = convert(existing).quantity+item.quantity;
      existing.unit = item.unit;
    } else result.push({id:makeId(),name:item.name,quantity:item.quantity,unit:item.unit,group:item.group,state:'todo'});
  }
  return result;
}
export function addShoppingBatch(state, recipe, servings, makeId=uid) {
  if (state.shoppingBatches.length >= 1000) throw Error('В покупках уже 1000 блюд. Удалите ненужные.');
  state.shoppingBatches.push({
    id:makeId(), recipeId:recipe.id, name:recipe.name, servings,
    items:addShopping([],scaled(recipe.ingredients,servings,recipe.servings),makeId)
  });
}
export function shoppingSections(state) {
  const standalone = state.shopping.length ? [{name:'Общий список',items:state.shopping}] : [];
  return [...state.shoppingBatches,...standalone];
}
export function findShoppingList(state,id) {
  return shoppingSections(state).find(section=>section.items.some(item=>item.id===id))?.items;
}
export function removeShoppingItem(state,id) {
  const list = findShoppingList(state,id);
  if (list) list.splice(list.findIndex(item=>item.id===id),1);
  state.shoppingBatches=state.shoppingBatches.filter(batch=>batch.items.length);
}
export function amount(item) {
  if (['г','мл'].includes(item.unit) && item.quantity >= 1000) {
    return formatNumber(item.quantity/1000)+' '+(item.unit==='г'?'кг':'л');
  }
  const value = item.quantity > 0 && item.quantity < .01 ? new Intl.NumberFormat('ru-RU',{maximumSignificantDigits:3}).format(item.quantity) : formatNumber(item.quantity);
  return value+' '+item.unit;
}

export const remaining = (timer,now=Date.now()) =>
  timer.end === null ? timer.remaining : Math.max(0,Math.ceil((timer.end-now)/1000));
export function changeTimer(timer,action,now=Date.now(),adjustment=0) {
  const left = remaining(timer,now);
  switch(action) {
    case 'start': return {...timer,remaining:left || timer.duration,end:now+(left || timer.duration)*1000};
    case 'pause': return {...timer,remaining:left,end:null};
    case 'reset': return {...timer,remaining:timer.duration,end:null};
    case 'adjust': {
      const seconds = Math.min(86400,Math.max(1,left+adjustment));
      return {...timer,remaining:seconds,end:timer.end!==null && left>0 ? now+seconds*1000 : null};
    }
    default: throw Error('Неизвестная команда таймера');
  }
}
export const duration = (session,now=Date.now()) =>
  session.elapsed + (session.activeSince === null ? 0 : Math.max(0,now-session.activeSince));
export function sessionFor(recipe,servings,now=Date.now(),id=uid()) {
  return {id,recipe,servings,step:0,done:[],startedAt:now,elapsed:0,activeSince:now,reporting:false,timers:[]};
}

export const dateKey = (time=Date.now()) => {
  const date = new Date(time);
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
};
export const ordered = history => [...history].sort((a,b)=>b.at-a.at);
export function statistics(history,now=Date.now()) {
  const visits = new Map();
  for (const entry of [...history].sort((a,b)=>a.at-b.at)) {
    const previous = visits.get(entry.recipeId) ?? [];
    previous.push(entry);
    visits.set(entry.recipeId,previous);
  }
  const month = dateKey(now).slice(0,7);
  const current = history.filter(entry => dateKey(entry.at).startsWith(month));
  const rated = history.filter(entry => entry.rating);
  const stats = {total:history.length, unique:visits.size, repeats:history.length-visits.size,
    average:rated.length ? rated.reduce((sum,e)=>sum+e.rating,0)/rated.length : 0,
    monthly:current.length,new:0,retry:0, popular:[],change:[]};
  for (const entries of visits.values()) {
    const first = entries[0];
    const last = entries.at(-1);
    stats.popular.push({name:last.name,count:entries.length});
    const ratings = entries.filter(entry=>entry.rating);
    if (ratings.length > 1) stats.change.push({name:last.name,from:ratings[0].rating,to:ratings.at(-1).rating});
    if (dateKey(first.at).startsWith(month)) stats.new++;
    if (entries.some((entry,index)=>index>0 && dateKey(entry.at).startsWith(month) &&
      (entries[index-1].rating>0 && entries[index-1].rating<=2 || entries[index-1].again==='no'))) stats.retry++;
  }
  stats.popular.sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,'ru'));
  return stats;
}
export function activity(history, period, now=Date.now()) {
  const points = [];
  const current = new Date(now);
  for (let index=5;index>=0;index--) {
    const start = new Date(current.getFullYear(),current.getMonth(),current.getDate());
    if (period==='month') { start.setDate(1); start.setMonth(start.getMonth()-index); }
    else start.setDate(start.getDate()-(start.getDay()+6)%7-index*7);
    const end = new Date(start);
    if (period==='month') end.setMonth(end.getMonth()+1);
    else end.setDate(end.getDate()+7);
    const label = start.toLocaleDateString('ru-RU',period==='month'?{month:'short'}:{day:'numeric',month:'short'});
    points.push({label,count:history.filter(entry=>entry.at>=+start && entry.at<+end).length});
  }
  return points;
}
