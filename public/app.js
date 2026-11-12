import { createAi } from './ai-ui.js';
import { isAndroid } from './native.js';
import { addShoppingBatch, amount, changeTimer, duration, findShoppingList, parseBackup, parseJsonText, parseRecipes, remaining, removeShoppingItem, scaled, sessionFor, shoppingSections, uid } from './core.js';
import { openStorage } from './storage.js';
import { createPantry, pantryMode } from './pantry-ui.js';
import { addInboxRecipes, readRecipeInbox } from './inbox.js';
import { area, button, clock, dateLabel, empty, field, foodList, h, icon, input, link, photo, readJson, readPhoto, saveFile, select } from './ui.js';
import { catalog, catalogResults, cookPage, goalLabels, historyPage, home, recipePage, reportPage, settingsPage, shoppingPage, timerCard } from './pages.js';
import { captureDraft, editor, groups, newRecipe, updateDraft } from './editor.js';

const main=document.querySelector('main');
const header=document.querySelector('#header');
const navigation=document.querySelector('#navigation');
const dock=document.querySelector('#timer-dock');
const dialog=document.querySelector('#dialog');
const pantryDialog=document.querySelector('#pantry-dialog');
const notice=document.querySelector('#notice');
const routes=[['home','Главная'],['recipes','Рецепты'],['shopping','Покупки'],['history','История'],['settings','Настройки']];
const recipeBase='./data/recipes/';
const filters={query:'',category:'',difficulty:'',time:'',status:'',favorite:false};
const portions=new Map();
let state, storage, builtins, recipeSchema, exchange, featuredId;
let pantry, drafts, deletedBatch=null, checkingGitHub=false;
let draft=null, draftKey=null, period='week', importRows=null, restoreData=null;
let installEvent, workerRegistration, wakeLock, wakePending=false, audio, noticeTimeout, working=false;
let pendingUpdate=false, offlineReady=isAndroid(), timerSignature='';
const announced=new Set();
const ai=createAi({getState:()=>state,findRecipe:id=>findRecipe(id),change:mutate=>change(mutate),render:()=>render(),showDialog,showError:error=>showError(error)});

const route = () => (location.hash.startsWith('#/')?location.hash.slice(2):'home').split('/');
const navigate = (path) => { location.hash='/'+path; };
const catalogItems = () => [...new Map([...builtins,...state.recipes].map(recipe=>[recipe.id,recipe])).values()];
const findRecipe = id => catalogItems().find(recipe=>recipe.id===id);
const getPortions = recipe => portions.get(recipe.id) ?? recipe.servings;
function persistDraft(key,value) {
  if (value===null) delete drafts[key]; else drafts[key]=structuredClone(value);
  void storage.saveDraft(key,value).catch(()=>say('Не удалось сохранить черновик на устройстве.'));
}
function saveReportDraft(form) {
  const key='report/'+form.dataset.entry;
  const {minutes,again,rating,good,errors,next}=Object.fromEntries(new FormData(form));
  const image=form.elements.image.files[0] || drafts[key]?.image;
  persistDraft(key,{minutes,again,rating,good,errors,next,image:image?.size<=35*1024*1024?image:undefined});
  const label=form.querySelector('.draft-photo');
  if (image?.size) {
    label.hidden=false;
    label.textContent=image.name;
  }
}
function say(message,undo=false) {
  clearTimeout(noticeTimeout);
  notice.textContent=message;
  if (undo) notice.insertAdjacentHTML('beforeend',button('Отменить','shop-batch-undo',{kind:'quiet'}));
  noticeTimeout=setTimeout(()=>{notice.textContent='';},undo?10000:5500);
}
function showDialog(title,content) {
  dialog.innerHTML='<div class="dialog-heading"><h2 id="dialog-title">'+h(title)+'</h2>'+button('Закрыть','dialog-close',{kind:'quiet',symbol:'close'})+'</div>'+content;
  if (!dialog.open) dialog.showModal();
}
function confirmAction(title,message,label,action,id='') {
  showDialog(title,'<p>'+h(message)+'</p><div class="actions">'+button(label,action,{id,kind:'primary'})+button('Отмена','dialog-close')+'</div>');
}
const showError = error => showDialog('Проверьте данные','<ul class="error-list">'+String(error.message || error).split('\n').map(line=>'<li>'+h(line)+'</li>').join('')+'</ul>'+
  (error.analysisResponse?'<details><summary>Показать ответ ИИ</summary><p class="muted">Этот ответ не сохранён как рекомендация. Его можно скопировать, чтобы разобраться с ошибкой.</p>'+area('ai-response',error.analysisResponse,'readonly rows="8" aria-label="Ответ ИИ"')+'</details>':''));
async function change(mutate) {
  state=await storage.change(current=>{mutate(current); return current;});
  await ai.refreshAdvice();
}
async function changeSession(mutate) {
  const id=state.session?.id;
  await change(current=>{
    if (!current.session || current.session.id!==id) throw Error('Готовка уже изменилась в другой вкладке.');
    mutate(current.session,current);
  });
}

function render({focus=false}={}) {
  if (!state) return;
  const [page,id,origin]=route();
  const tab=['recipe','editor','cook'].includes(page)?'recipes':page==='impression'?'history':page;
  document.documentElement.dataset.theme=state.settings.theme;
  document.querySelector('meta[name="theme-color"]').content=state.settings.theme==='dark'?'#181a15':'#f6f2e8';
  const recipes=catalogItems();
  const recipe=id?findRecipe(id):null;
  header.innerHTML='<div class="header-inner"><a class="brand" href="#/home">'+icon('logo')+'<span>Моя кухня</span></a><div class="header-right">'+
    (!navigator.onLine?'<span class="offline"><i></i> Без интернета</span>':'')+
    (pendingUpdate?button('Обновить','update',{kind:'quiet'}):'')+
    '<a class="header-settings" aria-label="Настройки" href="#/settings">'+icon('settings')+'</a></div></div>';
  navigation.innerHTML='<div class="nav-inner">'+routes.map(([value,label])=>
    '<a href="#/'+value+'" '+(value===tab?'aria-current="page"':'')+'>'+icon(value)+'<span>'+label+'</span></a>').join('')+'</div>';
  const unavailable = () => empty('Рецепт не найден','Откройте каталог, чтобы выбрать другое блюдо.',link('К рецептам','recipes',{kind:'primary'}));
  switch(page) {
    case 'home': main.innerHTML=home(state,recipes,findRecipe(featuredId) ?? recipes[0]); break;
    case 'recipes':
      main.innerHTML=catalog(recipes,filters,checkingGitHub);
      catalogResults(state,recipes,filters);
      break;
    case 'recipe': main.innerHTML=recipe?recipePage(state,recipe,getPortions(recipe),false,origin==='from-pantry',ai):unavailable(); break;
    case 'editor':
      if (id && !recipe) { main.innerHTML=unavailable(); break; }
      if (draftKey!==(id??'')) {
        draftKey=id??'';
        draft=structuredClone(drafts['editor/'+draftKey] ?? (recipe??newRecipe()));
      }
      main.innerHTML=editor(draft,id,drafts['editor-photo/'+draftKey]);
      break;
    case 'cook': main.innerHTML=cookPage(state,drafts['report/'+state.session?.id],ai); break;
    case 'impression': {
      const entry=state.history.find(item=>item.id===id && item.pending);
      main.innerHTML=entry?reportPage(entry,drafts['report/'+id]):empty('Запись недоступна','Откройте историю готовок.',link('В историю','history',{kind:'primary'}));
      break;
    }
    case 'shopping': main.innerHTML=shoppingPage(state); break;
    case 'history': main.innerHTML=historyPage(state,id,period,ai); break;
    case 'settings': main.innerHTML=settingsPage(state,offlineReady?'Офлайн-доступ готов.':'Офлайн-доступ появится после загрузки опубликованной сборки.',Boolean(installEvent),ai); break;
    default: main.innerHTML=empty('Страница не найдена','Перейдите на главную.',link('На главную','home',{kind:'primary'}));
  }
  renderDock(true);
  refreshWake();
  if (focus) {
    window.scrollTo(0,0);
    main.focus({preventScroll:true});
  }
}

function onRoute() {
  const [page,id]=route();
  if (page!=='editor') {draft=null; draftKey=null;}
  const wasOpen=pantryDialog.open;
  const mode=page==='recipes'?pantryMode(id):null;
  if (!mode) pantry.show(null);
  render({focus:true});
  if (mode) pantry.show(mode,catalogItems());
  else if (wasOpen && page==='recipes') main.querySelector('.catalog-options a').focus();
}
function nextCountdown(timers,now=Date.now()) {
  return Math.min(...timers.filter(timer=>timer.end!==null && remaining(timer,now)>0).map(timer=>remaining(timer,now)));
}
function renderDock(force=false) {
  const timers=state.session?.timers.filter(timer=>timer.end!==null || timer.remaining!==timer.duration) ?? [];
  const signature=timers.map(timer=>timer.id+'-'+(timer.end===null?'p':remaining(timer)>0?'r':'x')).join(',');
  if (!force && signature===timerSignature) return;
  timerSignature=signature;
  const focused=document.activeElement;
  const details=dock.querySelector('details');
  const open=details?.open || false;
  dock.hidden=!timers.length;
  if (!timers.length) { dock.innerHTML=''; return; }
  const next=nextCountdown(timers);
  const expired=timers.filter(timer=>timer.end!==null && remaining(timer)===0).length;
  dock.innerHTML='<details '+(open?'open':'')+'><summary>'+icon('time')+' Таймеры <strong>'+timers.length+'</strong>'+
    (expired?' <span class="overdue">Готово: '+expired+'</span>':'')+(Number.isFinite(next)?' <strong class="dock-clock" aria-label="Ближайший таймер">'+clock(next)+'</strong>':'')+'</summary><div class="dock-list">'+timers.map(timer=>timerCard(timer,false)).join('')+'</div></details>';
  if (focused?.dataset.do && details?.contains(focused)) {
    [...dock.querySelectorAll('[data-do]')].find(el=>el.dataset.do===focused.dataset.do && el.dataset.id===focused.dataset.id)?.focus();
  }
}
function tick() {
  if (!state?.session) return;
  const now=Date.now();
  renderDock();
  const countdown=dock.querySelector('.dock-clock');
  const next=nextCountdown(state.session.timers,now);
  if (countdown && Number.isFinite(next)) countdown.textContent=clock(next);
  for (const timer of state.session.timers) {
    const left=remaining(timer,now);
    const expired=timer.end!==null && left===0;
    for (const node of document.querySelectorAll('[data-timer]')) {
      if (node.dataset.timer!==timer.id) continue;
      node.querySelector('.timer-clock').textContent=clock(left);
      if (expired && !node.classList.contains('expired')) {
        node.classList.add('expired');
        node.querySelector('.timer-state').textContent='Время вышло';
        const control=node.querySelector('[data-do="timer-pause"]');
        if (control) {control.dataset.do='timer-start'; control.textContent='Повторить'; control.classList.add('primary');}
      }
    }
    if (!expired) continue;
    const key=state.session.id+':'+timer.id+':'+timer.end;
    if (announced.has(key)) continue;
    announced.add(key);
    say('Таймер завершён · '+timer.name);
    beep();
  }
}
function unlockSound() {
  if (!state.settings.sound) return;
  try {
    audio ??= new AudioContext();
    if (audio.state==='suspended') audio.resume().catch(()=>{});
  } catch {}
}
function beep() {
  if (!state.settings.sound || audio?.state!=='running') return;
  [0,.28,.56].forEach((offset,i)=>{
    const osc=audio.createOscillator(), gain=audio.createGain(), start=audio.currentTime+offset;
    osc.frequency.value=i===2?880:660;
    gain.gain.setValueAtTime(.18,start);
    gain.gain.exponentialRampToValueAtTime(.001,start+.23);
    osc.connect(gain).connect(audio.destination);
    osc.start(start); osc.stop(start+.24);
  });
}
async function refreshWake() {
  const wanted=()=>Boolean(route()[0]==='cook' && state?.session?.activeSince!=null && !state.session.reporting && state.settings.wake && document.visibilityState==='visible');
  if (!wanted()) {if (wakeLock) {const held=wakeLock; wakeLock=null; await held.release().catch(()=>{});} return;}
  if (!navigator.wakeLock || wakeLock || wakePending) return;
  wakePending=true;
  try {
    const held=await navigator.wakeLock.request('screen');
    if (!wanted()) {await held.release(); return;}
    wakeLock=held;
    held.addEventListener('release',()=>{if(wakeLock===held) wakeLock=null;});
  } catch {} finally {wakePending=false;}
}

function timerById(id) {
  const session=state.session;
  const saved=session.timers.find(item=>item.id===id);
  if (saved) return saved;
  const [step,i]=id.split('-').map(Number);
  const definition=session.recipe.steps[step]?.timers[i];
  if (!definition) throw Error('Таймер не найден.');
  return {id,name:definition.name,duration:definition.seconds,remaining:definition.seconds,end:null};
}
async function setTimer(id,action,absolute=null) {
  const base=timerById(id);
  await changeSession(session=>{
    const current=session.timers.find(item=>item.id===id) ?? base;
    const now=Date.now();
    const timer=changeTimer(current,action,now,absolute===null?0:absolute-remaining(current,now));
    session.timers=session.timers.filter(item=>item.id!==id);
    if (action!=='reset') session.timers.push(timer);
  });
  if (route()[0]==='cook' && !state.session.reporting) render();
  else renderDock(true);
}

function shopDialog(item) {
  const entry=item ?? {id:'',name:'',quantity:1,unit:'шт.',group:'Другое'};
  showDialog(item?'Изменить продукт':'Добавить продукт',
    '<form class="form-stack" id="shop-form"><input type="hidden" name="id" value="'+h(entry.id)+'">'+
    field('Продукт',input('name',entry.name,'required maxlength="120"'))+'<div class="form-grid">'+
    field('Количество',input('quantity',entry.quantity,'type="number" min=".00001" max="1000000000" step="any" required'))+
    field('Единица',input('unit',entry.unit,'required maxlength="24"'))+'</div>'+
    field('Группа',input('group',entry.group,'list="shopping-groups" required maxlength="50"'))+
    '<datalist id="shopping-groups">'+groups.map(group=>'<option value="'+h(group)+'">').join('')+'</datalist>'+
    '<button class="btn primary">Сохранить</button></form>');
}
function fileDialog(kind) {
  const fileForm = '<form class="form-stack" id="'+kind+'-file">'+
    field('Файл JSON',input('file','','type="file" accept=".json,application/json" required'))+
    '<button class="btn primary">Проверить файл</button></form>';
  if (kind==='restore') {
    showDialog('Восстановление данных','<p>Выберите файл резервной копии «Моей кухни», чтобы увидеть его содержимое.</p>'+fileForm);
    return;
  }
  showDialog('Импорт рецептов','<div class="form-stack"><form class="form-stack" id="import-text">'+
    field('Вставить из ChatGPT',area('json','','rows="5" maxlength="10485760" required placeholder="Вставьте рецепт или набор рецептов из ChatGPT"'))+
    '<div class="error-list" data-import-error role="alert" hidden></div><button class="btn primary">Проверить текст</button></form><hr class="import-divider">'+fileForm+'</div>');
}
function importPreview(rows) {
  const seen=new Set(catalogItems().map(recipe=>recipe.id));
  showDialog('Предпросмотр импорта','<form class="form-stack" id="import-confirm"><div class="import-list">'+rows.map((recipe,index)=>{
    const duplicate=seen.has(recipe.id);
    seen.add(recipe.id);
    return '<div class="import-row">'+photo(recipe.image,recipe.name)+'<div><h3>'+h(recipe.name)+'</h3><p>'+h(recipe.description)+'</p><p class="muted">'+h(recipe.category)+' · '+recipe.ingredients.length+' ингредиентов · '+recipe.steps.length+' шагов</p>'+
      (duplicate?field('Этот ID уже встречается',select('choice-'+index,[['copy','Создать копию'],['replace','Заменить'],['skip','Пропустить']],'copy')):'')+'</div></div>';
  }).join('')+'</div><div class="actions"><button class="btn primary">Добавить рецепты</button>'+button('Отмена','dialog-close')+'</div></form>');
}

function updateGitHubButton() {
  const control=document.querySelector('[data-do="check-github"]');
  if (!control) return;
  control.disabled=checkingGitHub;
  control.textContent=checkingGitHub?'Проверяем GitHub…':'Проверить GitHub';
  control.setAttribute('aria-busy',String(checkingGitHub));
}
async function checkGitHub() {
  if (!state || checkingGitHub) return;
  checkingGitHub=true;
  updateGitHubButton();
  try {
    const {recipes,issues}=await readRecipeInbox(recipeSchema,exchange.bundle);
    let result={added:0,existing:0,overLimit:0};
    if (recipes.length) await change(current=>{result=addInboxRecipes(current,builtins,recipes);});
    if (route()[0]==='recipes') {
      catalogResults(state,catalogItems(),filters);
    }
    const details=[
      result.added?'Добавлено рецептов: '+result.added:'Новых рецептов нет.',
      result.existing?'Уже в каталоге: '+result.existing+'.':'',
      result.overLimit?'Не добавлено из-за лимита каталога: '+result.overLimit+'.':''
    ].filter(Boolean).join(' ');
    if (issues.length && route()[0]==='recipes' && !dialog.open && !pantryDialog.open) {
      const list=issues.slice(0,12).map(({name,message})=>'<li>'+h(name)+' — '+h(message)+'</li>').join('');
      showDialog('Проверка GitHub','<p>'+h(details)+'</p><p>Файлов с ошибками: '+issues.length+'.</p><ul class="error-list">'+list+'</ul>');
    } else say(details+(issues.length?' Файлов с ошибками: '+issues.length+'.':''));
  } catch(error) {
    say(error.message || 'Не удалось проверить GitHub.');
  } finally {
    checkingGitHub=false;
    updateGitHubButton();
  }
}

function validPortions(id) {
  const field=main.querySelector('.detail-body input[name="servings"]');
  if (!field || field.dataset.id!==id) return true;
  if (field.checkValidity()) return true;
  field.closest('.portion-control').querySelector('.portion-error').hidden=false;
  field.reportValidity();
  return false;
}

function updateAutomaticStatus(current,recipeId) {
  const status=current.statuses.find(item=>item.id===recipeId);
  if (status && (status.automatic===false || !status.automatic && status.status!=='new')) return;
  const entries=current.history.filter(item=>item.recipeId===recipeId);
  if (!entries.length && !status?.automatic) return;
  current.statuses=current.statuses.filter(item=>item.id!==recipeId);
  if (entries.length) {
    const repeat=entries.some(entry=>!entry.pending && entry.again==='yes');
    current.statuses.push({id:recipeId,status:repeat?'repeat':'tried',automatic:true});
  }
}

async function finishCooking(pending=true,report={}) {
  const {id,recipe}=state.session;
  const entry={id,recipeId:recipe.id,name:recipe.name,at:Date.now(),minutes:Math.round(duration(state.session)/60000),
    rating:0,image:'',good:'',errors:'',next:'',again:'',servings:state.session.servings,recipeSnapshot:{...structuredClone(recipe),image:''},...report,...(pending?{pending:true}:{})};
  await changeSession((session,current)=>{
    if (current.history.some(item=>item.id===entry.id)) throw Error('Эта готовка уже записана.');
    if (current.history.length>=50000) throw Error('В истории уже 50 000 записей.');
    current.history.push(entry);
    updateAutomaticStatus(current,entry.recipeId);
    if (current.planned===entry.recipeId) current.planned=null;
    current.session=null;
  });
  return entry;
}

async function startCooking(id,replace=false) {
  const recipe=findRecipe(id);
  const oldId=state.session?.id;
  if (state.session && !replace) {
    if (state.session.recipe.id===id) {navigate('cook'); return;}
    confirmAction('Уже есть незавершённая готовка','Текущие шаги и таймеры будут сброшены при запуске другого блюда.','Начать другое блюдо','start-replace',id);
    return;
  }
  await change(current=>{
    if (current.session && (!replace || current.session.id!==oldId)) throw Error('В другой вкладке начата готовка.');
    current.session=sessionFor(recipe,getPortions(recipe));
  });
  dialog.close();
  navigate('cook');
  if (route()[0]==='cook') render({focus:true});
}

async function onAction(action,id) {
  const recipe=action==='random'?null:findRecipe(id);
  if (action.startsWith('editor-') && !action.startsWith('editor-reset')) {
    const editingKey=draftKey;
    const editingDraft=draft;
    const photoKey='editor-photo/'+editingKey;
    await updateDraft(document.querySelector('#editor-form'),editingDraft,action.slice(7),id,drafts[photoKey]);
    persistDraft('editor/'+editingKey,editingDraft);
    if (drafts[photoKey]) persistDraft(photoKey,null);
    if (route()[0]!=='editor' || draft!==editingDraft) return;
    const scroll=window.scrollY;
    render();
    window.scrollTo(0,scroll);
    return;
  }
  if (action.startsWith('timer-')) {
    if (action==='timer-edit') {
      const timer=timerById(id);
      showDialog(timer.name,'<form class="form-stack" id="timer-form"><input type="hidden" name="id" value="'+h(id)+'">'+
        field('Осталось секунд',input('seconds',Math.max(1,remaining(timer)),'type="number" min="1" max="86400" required'))+
        '<button class="btn primary">Применить</button></form>');
    } else await setTimer(id,action.slice(6));
    return;
  }
  switch(action) {
    case 'dialog-close': dialog.close(); return;
    case 'editor-reset':
      confirmAction('Сбросить черновик?','Несохранённые правки будут удалены.','Сбросить','editor-reset-confirm');
      return;
    case 'editor-reset-confirm':
      if (route()[0]!=='editor' || draftKey===null) return;
      persistDraft('editor/'+draftKey,null);
      if (drafts['editor-photo/'+draftKey]) persistDraft('editor-photo/'+draftKey,null);
      draftKey=null;
      dialog.close();
      render({focus:true});
      return;
    case 'portion-up':
    case 'portion-down': {
      const field=main.querySelector('.detail-body input[name="servings"]');
      const delta=action==='portion-up'?1:-1;
      field.value=Math.max(1,Math.min(100,(field.validity.valid?+field.value:getPortions(recipe))+delta));
      field.dispatchEvent(new Event('input',{bubbles:true}));
      return;
    }
    case 'start': if (validPortions(id)) await startCooking(id); return;
    case 'start-replace': await startCooking(id,true); return;
    case 'random': {
      const choices=catalogItems().filter(recipe=>recipe.id!==featuredId);
      featuredId=choices[Math.floor(Math.random()*choices.length)]?.id ?? featuredId;
      break;
    }
    case 'favorite':
      await change(current=>{current.favorites=current.favorites.includes(id)?current.favorites.filter(value=>value!==id):[...current.favorites,id];});
      if (route()[0]==='recipes') {
        catalogResults(state,catalogItems(),filters);
        [...document.querySelectorAll('.favorite')].find(el=>el.dataset.id===id)?.focus({preventScroll:true});
        return;
      }
      break;
    case 'plan': await change(current=>{current.planned=current.planned===id?null:id;}); say(state.planned?'Добавлено в план':'Убрано из плана'); break;
    case 'recipe-shop':
      if (!validPortions(id)) return;
      await change(current=>addShoppingBatch(current,recipe,getPortions(recipe)));
      say('Блюдо добавлено отдельным списком');
      return;
    case 'export-recipe': await saveFile(id+'.json',recipe); return;
    case 'export-all': await saveFile('moya-kuhnya-recipes.json',{format:'moya-kuhnya-recipes',version:1,recipes:catalogItems()}); return;
    case 'import': {
      const menu=document.querySelector('.recipe-add-menu[open]');
      if (menu) {
        menu.open=false;
        menu.querySelector('summary').focus();
      }
      fileDialog('import');
      return;
    }
    case 'restore': fileDialog('restore'); return;
    case 'backup': await saveFile('moya-kuhnya-backup-'+new Date().toISOString().slice(0,10)+'.json',{format:'moya-kuhnya-backup',version:2,created:Date.now(),data:await storage.read()}); return;
    case 'restore-confirm': {
      const snapshot=restoreData;
      if (!snapshot) return;
      dialog.close();
      say('Восстанавливаем данные…');
      state=await storage.change(()=>snapshot);
      await ai.refreshAdvice();
      say('Данные восстановлены');
      break;
    }
    case 'shop-add': shopDialog(); return;
    case 'shop-edit': {
      const item=findShoppingList(state,id)?.find(item=>item.id===id);
      if (item) shopDialog(item);
      return;
    }
    case 'shop-delete': await change(current=>removeShoppingItem(current,id)); break;
    case 'shop-batch-delete': {
      let removed;
      await change(current=>{
        const index=current.shoppingBatches.findIndex(batch=>batch.id===id);
        if (index>=0) removed={index,batch:current.shoppingBatches.splice(index,1)[0]};
      });
      deletedBatch=removed;
      if (removed) say('Блюдо удалено из покупок',true);
      break;
    }
    case 'shop-batch-undo': {
      if (!deletedBatch) return;
      const {index,batch}=deletedBatch;
      await change(current=>{
        if (!current.shoppingBatches.some(item=>item.id===batch.id)) current.shoppingBatches.splice(index,0,batch);
      });
      deletedBatch=null;
      say('Блюдо возвращено в покупки');
      break;
    }
    case 'shop-home':
      await change(current=>{
        const item=findShoppingList(current,id)?.find(item=>item.id===id);
        if (item) item.state=item.state==='home'?'todo':'home';
      });
      break;
    case 'shop-copy': {
      const list=shoppingSections(state).map(section=>[section.name+(section.id?' (порций: '+section.servings+')':''),
        ...section.items.map(item=>(item.state==='bought'?'✓ ':item.state==='home'?'Есть дома · ':'• ')+item.name+' — '+amount(item))
      ].join('\n')).join('\n\n');
      try {await navigator.clipboard.writeText(list); say('Список скопирован');}
      catch {showDialog('Список покупок',area('copy',list,'readonly rows="9" aria-label="Список покупок"'));}
      return;
    }
    case 'cook-step': await changeSession(session=>{session.step=Math.max(0,Math.min(session.recipe.steps.length-1,+id));}); render({focus:true}); return;
    case 'cook-check': await changeSession(session=>{session.done=session.done.includes(session.step)?session.done.filter(i=>i!==session.step):[...session.done,session.step];}); break;
    case 'cook-pause':
      await changeSession(session=>{
        const now=Date.now();
        if(session.activeSince===null) session.activeSince=now;
        else {session.elapsed=duration(session,now); session.activeSince=null;}
      });
      break;
    case 'cook-finish': {
      const entry=await finishCooking();
      location.replace('#/impression/'+entry.id);
      return;
    }
    case 'report-defer': {
      if (state.session?.id!==id || !state.session.reporting) return;
      const entry=await finishCooking();
      navigate('history/'+entry.recipeId);
      return;
    }
    case 'report-back': await changeSession(session=>{session.reporting=false; session.activeSince=Date.now();}); break;
    case 'cook-cancel': confirmAction('Отменить готовку?','Шаги и таймеры этой попытки будут удалены.','Отменить готовку','cook-discard'); return;
    case 'cook-discard': await changeSession((session,current)=>{current.session=null;}); dialog.close(); navigate('home'); return;
    case 'history-delete': {
      const entry=state.history.find(item=>item.id===id);
      if (!entry) return;
      confirmAction('Удалить запись?',
        '«'+entry.name+'», '+dateLabel(entry.at)+'. Запись, оценка, заметки и фото будут удалены из истории.',
        'Удалить запись','history-delete-confirm',id);
      const status=state.statuses.find(item=>item.id===entry.recipeId);
      if (status && status.automatic===undefined && ['tried','repeat'].includes(status.status) &&
          state.history.filter(item=>item.recipeId===entry.recipeId).length===1) {
        dialog.querySelector('.actions').insertAdjacentHTML('beforebegin','<p><label class="toggle"><input type="checkbox" name="reset-status"> Также вернуть статус блюда «Не пробовал»</label></p>');
      }
      return;
    }
    case 'history-delete-confirm': {
      let removed=false;
      const reset=dialog.querySelector('[name="reset-status"]')?.checked;
      await change(current=>{
        const index=current.history.findIndex(entry=>entry.id===id);
        if (index!==-1) {
          const [entry]=current.history.splice(index,1);
          current.aiAnalyses=(current.aiAnalyses??[]).filter(item=>item.entryId!==entry.id);
          const status=current.statuses.find(item=>item.id===entry.recipeId);
          if (reset && status?.automatic===undefined && ['tried','repeat'].includes(status?.status) &&
              !current.history.some(item=>item.recipeId===entry.recipeId)) current.statuses=current.statuses.filter(item=>item.id!==entry.recipeId);
          else updateAutomaticStatus(current,entry.recipeId);
          removed=true;
        }
      });
      dialog.close();
      if (removed) persistDraft('report/'+id,null);
      say(removed?'Запись удалена из истории':'Запись уже удалена');
      const [page,recipeId]=route();
      if (page==='history' && recipeId && !state.history.some(entry=>entry.recipeId===recipeId)) navigate('history');
      else render({focus:true});
      return;
    }
    case 'goals':
      showDialog('Цели на месяц','<form class="form-stack" id="goals-form"><p class="muted">Укажите 0, чтобы отключить цель. Неудачной считается попытка с оценкой 1–2 или ответом «Нет» на вопрос о повторе.</p>'+
        Object.entries(goalLabels).map(([key,label])=>field(label,input(key,state.goals[key],'type="number" min="0" max="100" required'))).join('')+
        '<button class="btn primary">Сохранить цели</button></form>');
      return;
    case 'install': await installEvent?.prompt(); installEvent=null; break;
    case 'update': workerRegistration?.waiting?.postMessage('update'); return;
    default: return;
  }
  render();
}
async function run(work) {
  if (working || !state) return;
  working=true;
  try {await work();} catch(error) {showError(error);} finally {working=false;}
}

document.addEventListener('click',event=>{
  const menu=document.querySelector('.recipe-add-menu[open]');
  if (menu && !menu.contains(event.target)) menu.open=false;
  if (event.target.closest('.skip')) {
    event.preventDefault();
    main.focus();
    main.scrollIntoView();
    return;
  }
  if (state) unlockSound();
  const control=event.target.closest('[data-do]');
  if (!control) return;
  if (control.dataset.do.startsWith('ai-')) {void ai.action(control.dataset.do,control.dataset.id).catch(showError); return;}
  if (control.dataset.do==='check-github') void checkGitHub();
  else void run(()=>onAction(control.dataset.do,control.dataset.id));
});
document.addEventListener('keydown',event=>{
  if (event.key!=='Escape' || dialog.open || pantryDialog.open) return;
  const menu=document.querySelector('.recipe-add-menu[open]');
  if (menu) {
    menu.open=false;
    menu.querySelector('summary').focus();
  }
});
document.addEventListener('input',event=>{
  const target=event.target;
  const editorForm=target.closest('#editor-form');
  if (editorForm && draft) {
    captureDraft(editorForm,draft);
    persistDraft('editor/'+draftKey,draft);
    if (target.type==='file') {
      const selected=target.files[0];
      const key='editor-photo/'+draftKey;
      if (selected?.size<=35*1024*1024) persistDraft(key,selected);
      else if (drafts[key]) persistDraft(key,null);
    }
  }
  const report=target.closest('#report-form');
  if (report) saveReportDraft(report);
  if (target.closest('#filters')) {
    filters[target.name]=target.type==='checkbox'?target.checked:target.value;
    catalogResults(state,catalogItems(),filters);
  }
  if (target.name==='servings' && target.closest('.detail-body')) {
    const error=target.closest('.portion-control').querySelector('.portion-error');
    error.hidden=target.validity.valid;
    if (!target.validity.valid) return;
    const recipe=findRecipe(target.dataset.id);
    if (!recipe) return;
    portions.set(recipe.id,+target.value);
    const section=target.closest('section');

    section.querySelector('.ingredients').outerHTML=foodList(scaled(recipe.ingredients,+target.value,recipe.servings));
  }
});
document.addEventListener('change',event=>{
  const target=event.target;
  void run(async()=>{
    if (target.name==='recipe-status') {
      await change(current=>{current.statuses=[...current.statuses.filter(item=>item.id!==target.dataset.id),{id:target.dataset.id,status:target.value,automatic:false}];});
      say('Статус сохранён');
    } else if (target.dataset.item) {
      await change(current=>{const item=findShoppingList(current,target.dataset.item)?.find(item=>item.id===target.dataset.item); if(item) item.state=target.checked?'bought':'todo';});
      render();
    } else if (['theme','sound','wake'].includes(target.name)) {
      await change(current=>{current.settings[target.name]=target.type==='checkbox'?target.checked:target.value;});
      if (target.name==='sound') unlockSound();
      render();
    } else if (target.name==='period') {period=target.value; render();}
  });
});
document.addEventListener('submit',event=>{
  if (event.defaultPrevented) return;
  event.preventDefault();
  const form=event.target;
  if (form.id==='ai-settings') {void ai.save(form);return;}
  const data=new FormData(form);
  void run(async()=>{
    switch(form.getAttribute('id')) {
      case 'editor-form': {
        const key=draftKey;
        const saved=structuredClone(captureDraft(form,draft));
        const photoKey='editor-photo/'+key;
        const image=await readPhoto(form.elements.image.files[0] || drafts[photoKey]);
        if (image) saved.image=image;
        persistDraft('editor/'+key,saved);
        if (drafts[photoKey]) persistDraft(photoKey,null);
        if (draftKey===key) draft=saved;
        parseRecipes(saved,recipeSchema,exchange.bundle);
        if (event.submitter?.value==='preview') {showDialog('Предпросмотр рецепта',recipePage(state,saved,saved.servings,true));return;}
        if (event.submitter?.value==='export') {await saveFile(saved.id+'.json',saved);return;}
        await change(current=>{
          const recipes=[...current.recipes.filter(item=>item.id!==saved.id),saved];
          if (recipes.length>1000) throw Error('В локальном каталоге помещается до 1000 добавленных рецептов.');
          current.recipes=recipes;
        });
        persistDraft('editor/'+key,null);
        draft=null;
        draftKey=null;
        portions.delete(saved.id);
        say('Рецепт сохранён');
        navigate('recipe/'+saved.id);
        return;
      }
      case 'import-file':
      case 'import-text': {
        const inline=form.querySelector('[data-import-error]');
        try {
          const value=inline?parseJsonText(data.get('json')):await readJson(form.elements.file.files[0],256);
          importRows=parseRecipes(value,recipeSchema,exchange.bundle);
        } catch(error) {
          if (!inline) throw error;
          inline.hidden=false;
          inline.textContent=error.message;
          return;
        }
        importPreview(importRows);
        return;
      }
      case 'import-confirm': {
        const rows=importRows;
        if (!rows) return;
        let count=0;
        const builtInIds=new Set(builtins.map(recipe=>recipe.id));
        await change(current=>{
          const added=new Map(current.recipes.map(recipe=>[recipe.id,recipe]));
          rows.forEach((recipe,index)=>{
            const choice=data.get('choice-'+index);
            if (choice==='skip') return;
            const id=choice==='copy'?uid():recipe.id;
            if (choice===null && (added.has(id)||builtInIds.has(id))) throw Error('Появился рецепт с тем же ID. Откройте файл снова и выберите действие.');
            added.set(id,{...recipe,id});
            count++;
          });
          if (added.size>1000) throw Error('В локальном каталоге помещается до 1000 добавленных рецептов.');
          current.recipes=[...added.values()];
        });
        importRows=null;
        dialog.close();
        say('Добавлено рецептов: '+count);
        if (route()[0]==='recipes') render(); else navigate('recipes');
        return;
      }
      case 'restore-file': {
        restoreData=parseBackup(await readJson(form.elements.file.files[0],256),exchange.backup,exchange.legacyBackup);
        const summary='Рецептов: '+restoreData.recipes.length+' · Записей дневника: '+restoreData.history.length+' · Покупок: '+shoppingSections(restoreData).reduce((sum,section)=>sum+section.items.length,0)+'.';
        confirmAction('Заменить локальные данные?',summary+' Существующие данные этого приложения будут заменены содержимым копии.','Восстановить данные','restore-confirm');
        return;
      }
      case 'shop-form': {
        const item={id:data.get('id')||uid(),name:data.get('name').trim(),quantity:+data.get('quantity'),unit:data.get('unit').trim(),group:data.get('group').trim(),state:'todo'};
        if (!item.name||!item.unit||!item.group) throw Error('Заполните название, единицу и группу.');
        await change(current=>{
          if (!data.get('id')) {
            if (current.shopping.length>=10000) throw Error('В общем списке уже 10000 продуктов.');
            current.shopping.push(item);
            return;
          }
          const existing=findShoppingList(current,item.id)?.find(record=>record.id===item.id);
          if (!existing) throw Error('Этот продукт уже удалён.');
          Object.assign(existing,{...item,state:existing.state});
        });
        break;
      }
      case 'timer-form': await setTimer(data.get('id'),'adjust',+data.get('seconds')); dialog.close(); return;
      case 'goals-form': await change(current=>{current.goals=Object.fromEntries(Object.keys(goalLabels).map(key=>[key,+data.get(key)]));}); break;
      case 'report-form': {
        const id=form.dataset.entry;
        const key='report/'+id;
        const image=await readPhoto(form.elements.image.files[0] || drafts[key]?.image);
        const report={minutes:+data.get('minutes'),rating:+data.get('rating'),
          good:data.get('good').trim(),errors:data.get('errors').trim(),next:data.get('next').trim(),again:data.get('again')};
        let recipeId;
        if (state.session?.id===id && state.session.reporting) {
          const entry=await finishCooking(false,{...report,image});
          recipeId=entry.recipeId;
        } else await change(current=>{
          const entry=current.history.find(item=>item.id===id && item.pending);
          if (!entry) throw Error('Эта запись уже сохранена или удалена.');
          Object.assign(entry,report);
          if (image) entry.image=image;
          delete entry.pending;
          recipeId=entry.recipeId;
          updateAutomaticStatus(current,recipeId);
        });
        persistDraft(key,null);
        say('Впечатления сохранены');
        navigate('history/'+recipeId);
        return;
      }
      default:return;
    }
    dialog.close();
    render();
  });
});

const json = async path => {
  const response=await fetch(path);
  if (!response.ok) throw Error('Не удалось загрузить '+path);
  return response.json();
};
function softRender() {
  if (state && !main.querySelector('#editor-form,#report-form') && !dialog.open && !pantryDialog.open) render();
}
async function setupWorker() {
  if (isAndroid() || !('serviceWorker' in navigator) || document.documentElement.dataset.build!=='production') return;
  try {
    const wasControlled=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if (wasControlled && pendingUpdate) location.reload();
      else {offlineReady=true; softRender();}
    });
    workerRegistration=await navigator.serviceWorker.register('./sw.js');
    const update=()=>{
      pendingUpdate=Boolean(workerRegistration.waiting);
      softRender();
      if (pendingUpdate) say('Доступно обновление. Завершите ввод данных и нажмите «Обновить».');
    };
    workerRegistration.addEventListener('updatefound',()=>{
      workerRegistration.installing?.addEventListener('statechange',update);
    });
    update();
    await navigator.serviceWorker.ready;
    offlineReady=true;
    softRender();
  } catch {say('Офлайн-доступ не удалось подготовить.');}
}
addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;softRender();});
addEventListener('appinstalled',()=>{installEvent=null;softRender();say('Приложение установлено');});
addEventListener('hashchange',onRoute);
addEventListener('online',softRender);
addEventListener('offline',softRender);
document.addEventListener('visibilitychange',()=>{refreshWake();tick();});
dialog.addEventListener('close',()=>{restoreData=null;importRows=null;});
setInterval(tick,250);
try {
  main.innerHTML='<p class="loading">Открываем «Мою кухню»…</p>';
  const [ids,schema,exchangeSchema,db,aiSchema]=await Promise.all([json(recipeBase+'index.json'),json('./data/recipe.schema.json'),json('./data/exchange.schema.json'),openStorage(),json('./data/ai-result.schema.json')]);
  recipeSchema=schema;
  exchange=exchangeSchema.$defs;
  storage=db;
  const [saved,recipes,savedDrafts,savedPantry]=await Promise.all([
    storage.read(),Promise.all(ids.map(id=>json(recipeBase+id+'.json'))),storage.readDrafts(),storage.readPantry()
  ]);
  [state,builtins,drafts]=[saved,recipes,savedDrafts];
  pantry=createPantry(pantryDialog,storage,savedPantry);
  featuredId='pilaf';
  await ai.initialize(aiSchema);
  onRoute();
  tick();
  void setupWorker();
} catch(error) {
  main.innerHTML=empty('Не удалось открыть «Мою кухню»',error.message,'<button class="btn primary" id="reload">Повторить</button>');
  document.querySelector('#reload').addEventListener('click',()=>location.reload());
}
