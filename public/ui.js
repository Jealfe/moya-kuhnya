import { isAndroid, nativePlugin } from './native.js';
import { amount, formatNumber, totalTime } from './core.js';

export const h = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const statusLabels = {new:'Не пробовал',tried:'Пробовал',repeat:'Хочу повторить',mastered:'Освоено'};
export const statusFor = (state,id) => state.statuses.find(item=>item.id===id)?.status ??
  (state.history.some(entry=>entry.recipeId===id) ? 'tried' : 'new');
const paths = {
  logo:'M4 13h16M5 17h14M7 20h10M6 13a6 6 0 0 1 12 0M12 4v2M3 9l2 1m16-1-2 1',
  home:'m3 10 9-7 9 7v10H3zM9 20v-6h6v6',
  recipes:'M4 19V5a2 2 0 0 1 2-2h14v17H6a2 2 0 0 1 0-4h14M8 7h8m-8 4h6',
  shopping:'M3 4h3l2 11h11l2-8H7M9 20h.01m9 0h.01',
  history:'M3 12a9 9 0 1 0 2-6L3 8m0-5v5h5m4-1v5l3 2',
  settings:'M12 8a4 4 0 1 0 .01 0M10 2h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1z',
  time:'M12 3a9 9 0 1 0 .01 0M12 7v5l3 2',
  arrow:'M4 12h15m-6-6 6 6-6 6',
  back:'M20 12H5m6-6-6 6 6 6',
  heart:'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-2 2-2 5 0 7l8 8 8-8c2-2 2-5 0-7z',
  spark:'M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z',
  plus:'M12 4v16M4 12h16',
  download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  upload:'M12 15V3m-5 5 5-5 5 5M4 17v4h16v-4',
  check:'m4 12 5 5L20 6',
  search:'M10 4a6 6 0 1 0 .01 0M15 15l5 5',
  bowl:'M3 12h18a9 9 0 0 1-18 0zm5 9h8M8 8c-2-2 1-3 0-5m5 5c-2-2 1-3 0-5',
  trend:'m3 16 6-6 4 4 7-8m-5 0h5v5',
  star:'m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z',
  close:'m5 5 14 14M19 5 5 19',
  pause:'M9 4v16m6-16v16'
};
export const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
export const button = (label,action,{id='',kind='',symbol='',disabled=false}={}) =>
  '<button type="button" class="btn '+kind+'" data-do="'+action+'" data-id="'+h(id)+'" '+(disabled?'disabled':'')+'>'+(symbol?icon(symbol):'')+h(label)+'</button>';
export const link = (label,route,{kind='',symbol=''}={}) =>
  '<a class="btn '+kind+'" href="#/'+route+'">'+(symbol?icon(symbol):'')+h(label)+'</a>';
export const options = (entries,selected) => entries.map(([value,label]) =>
  '<option value="'+h(value)+'"'+(String(selected)===String(value)?' selected':'')+'>'+h(label)+'</option>').join('');
export const field = (label,body) => '<label class="field"><span>'+h(label)+'</span>'+body+'</label>';
export const input = (name,value='',attrs='') => '<input name="'+name+'" value="'+h(value)+'" '+attrs+'>';
export const area = (name,value='',attrs='') => '<textarea name="'+name+'" '+attrs+'>'+h(value)+'</textarea>';
export const select = (name,entries,value,attrs='') => '<select name="'+name+'" '+attrs+'>'+options(entries,value)+'</select>';
export const heading = (title,description='',actions='') =>
  '<div class="page-heading"><div><h1>'+h(title)+'</h1>'+(description?'<p class="muted">'+h(description)+'</p>':'')+'</div><div class="actions">'+actions+'</div></div>';
export const empty = (title,description,actions='') =>
  '<div class="empty panel">'+icon('bowl')+'<h3>'+h(title)+'</h3><p>'+h(description)+'</p>'+actions+'</div>';
export const dateLabel = value => new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
export const artIndex = value => /^dish:(?:[0-9]|[1-6][0-9])$/.test(value ?? '') ? +value.slice(5) : -1;
export const safePhoto = value => /^data:image\/(?:jpeg|png|webp);base64,/.test(value ?? '') ? value : '';
export function photo(value,alt='',variant='') {
  const index=artIndex(value);
  if (index>=0) {
    const size=index<20?4:5;
    const slot=index<20?index:(index-20)%25;
    const board=index<20?'dishes':index<45?'dishes-21-45':'dishes-46-70';
    return '<div class="photo '+variant+'" aria-hidden="true"><div class="tile"><img src="./images/'+board+'.jpg" alt="" style="--cols:'+size+';--col:'+slot%size+';--row:'+Math.floor(slot/size)+'"></div></div>';
  }
  if (safePhoto(value)) return '<div class="photo '+variant+'"><img class="local-photo" src="'+h(value)+'" alt="'+h(alt)+'"></div>';
  return '<div class="photo no-photo '+variant+'">'+icon('bowl')+'</div>';
}
export async function readPhoto(file) {
  if (!file?.size) return '';
  if (file.size > 35*1024*1024) throw Error('Изображение больше 35 МБ.');
  const source = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = source;
    await img.decode();
    const scale = Math.min(1,1280/Math.max(img.width,img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.width*scale));
    canvas.height = Math.max(1,Math.round(img.height*scale));
    const ctx = canvas.getContext('2d',{alpha:false});
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/webp',.84);
  } catch { throw Error('Не удалось открыть изображение. Выберите JPG, PNG или WebP.'); }
  finally { URL.revokeObjectURL(source); }
}

export function card(recipe,state) {
  const favorite=state.favorites.includes(recipe.id);
  const status=statusFor(state,recipe.id);
  return '<article class="recipe-card">'+photo(recipe.image,recipe.name)+
    '<button type="button" class="favorite '+(favorite?'selected':'')+'" data-do="favorite" data-id="'+h(recipe.id)+'" aria-pressed="'+favorite+'" aria-label="Избранное — '+h(recipe.name)+'">'+icon('heart')+'</button>'+
    '<div class="card-content"><div class="kicker">'+h(recipe.category)+'</div><h3><a href="#/recipe/'+h(recipe.id)+'">'+h(recipe.name)+'</a></h3>'+
    '<div class="card-meta">'+icon('time')+' '+totalTime(recipe)+' мин <span>·</span> '+recipe.difficulty+'/5'+(status==='new'?'':' <span>·</span> '+statusLabels[status])+'</div></div></article>';
}
export const list = items => '<ul class="simple-list">'+items.map(item=>'<li>'+h(item)+'</li>').join('')+'</ul>';
export const foodList = items => '<ul class="ingredients">'+items.map(item=>'<li><div>'+h(item.name)+(item.substitution?'<small>Замена · '+h(item.substitution)+'</small>':'')+'</div><strong>'+h(amount(item))+'</strong></li>').join('')+'</ul>';
export const stat = (label,value,symbol) => '<div class="stat panel"><span class="stat-icon">'+icon(symbol)+'</span><div><strong>'+h(value)+'</strong><span>'+h(label)+'</span></div></div>';
export const ratingLabel = rating => rating ? formatNumber(rating)+' / 5' : 'Без оценки';
export const clock = seconds => [Math.floor(seconds/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
export async function saveFile(name,value) {
  if (isAndroid()) {
    await nativePlugin('KitchenFiles').save({name,content:JSON.stringify(value,null,2)});
    return;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export async function readJson(file, maxMb) {
  if (!file) throw Error('Выберите файл JSON.');
  if (file.size > maxMb*1024*1024) throw Error('Файл больше '+maxMb+' МБ.');
  try { return JSON.parse(await file.text()); }
  catch { throw Error('Файл не удалось прочитать как JSON. Проверьте синтаксис и кодировку UTF-8.'); }
}
