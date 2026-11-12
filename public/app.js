import { addShoppingBatch, amount, changeTimer, duration, findShoppingList, parseBackup, parseJsonText, parseRecipes, remaining, removeShoppingItem, scaled, sessionFor, shoppingSections, uid } from './core.js';
import { openStorage } from './storage.js';
import { addInboxRecipes, readRecipeInbox } from './inbox.js';
import { area, button, clock, empty, field, foodList, h, icon, input, link, photo, readJson, readPhoto, saveFile, select } from './ui.js';
import { catalog, catalogResults, cookPage, goalLabels, historyPage, home, recipePage, settingsPage, shoppingPage, timerCard } from './pages.js';
import { captureDraft, editor, groups, newRecipe, updateDraft } from './editor.js';

const main=document.querySelector('main');
const header=document.querySelector('#header');
const navigation=document.querySelector('#navigation');
const dock=document.querySelector('#timer-dock');
const dialog=document.querySelector('dialog');
const notice=document.querySelector('#notice');
const routes=[['home','Главная'],['recipes','Рецепты'],['shopping','Покупки'],['history','История'],['settings','Настройки']];
const recipeBase='./data/recipes/';
const filters={query:'',category:'',difficulty:'',time:'',status:'',favorite:false};
const portions=new Map();
let state, storage, builtins, recipeSchema, exchange, featuredId;
let draft=null, draftKey=null, period='week', importRows=null, restoreData=null;
let installEvent, workerRegistration, wakeLock, wakePending=false, audio, noticeTimeout, working=false;
let pendingUpdate=false, offlineReady=false, timerSignature='';
let routeValue='';
const announced=new Set();

const route = () => (location.hash.startsWith('#/')?location.hash.slice(2):'home').split('/');
const navigate = (path) => { location.hash='/'+path; };
const catalogItems = () => [...new Map([...builtins,...state.recipes].map(recipe=>[recipe.id,recipe])).values()];
const findRecipe = id => catalogItems().find(recipe=>recipe.id===id);
const getPortions = recipe => portions.get(recipe.id) ?? recipe.servings;
function say(message) {
  clearTimeout(noticeTimeout);
  notice.textContent=message;
  noticeTimeout=setTimeout(()=>{notice.textContent='';},5500);
}
function showDialog(title,content) {
  dialog.innerHTML='<div class="dialog-heading"><h2>'+h(title)+'</h2>'+button('Закрыть','dialog-close',{kind:'quiet',symbol:'close'})+'</div>'+content;
  if (!dialog.open) dialog.showModal();
}
function confirmAction(title,message,label,action,id='') {
  showDialog(title,'<p>'+h(message)+'</p><div class="actions">'+button(label,action,{id,kind:'primary'})+button('Отмена','dialog-close')+'</div>');
}
const showError = error => showDialog('Проверьте данные','<ul class="error-list">'+String(error.message || error).split('\n').map(line=>'<li>'+h(line)+'</li>').join('')+'</ul>');
async function change(mutate) {
  state=await storage.change(current=>{mutate(current); return current;});
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
  const [page,id]=route();
  const tab=['recipe','editor','cook'].includes(page)?'recipes':page;
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
      main.innerHTML=catalog(state,recipes,filters);
      catalogResults(state,recipes,filters);
      break;
    case 'recipe': main.innerHTML=recipe?recipePage(state,recipe,getPortions(recipe)):unavailable(); break;
    case 'editor':
      if (id && !recipe) { main.innerHTML=unavailable(); break; }
      if (draftKey!==(id??'')) { draft=recipe?structuredClone(recipe):newRecipe(); draftKey=id??''; }
      main.innerHTML=editor(draft,id);
      break;
    case 'cook': main.innerHTML=cookPage(state); break;
    case 'shopping': main.innerHTML=shoppingPage(state); break;
    case 'history': main.innerHTML=historyPage(state,id,period); break;
    case 'settings': main.innerHTML=settingsPage(state,offlineReady?'Офлайн-доступ готов.':'Офлайн-доступ появится после загрузки опубликованной сборки.',Boolean(installEvent)); break;
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
  if (routeValue.startsWith('#/editor') && location.hash!==routeValue) {draft=null; draftKey=null;}
  routeValue=location.hash;
  render({focus:true});
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
  const active=timers.filter(timer=>timer.end!==null && remaining(timer)>0).length;
  const expired=timers.filter(timer=>timer.end!==null && remaining(timer)===0).length;
  dock.innerHTML='<details '+(open?'open':'')+'><summary>'+icon('time')+' Таймеры <strong>'+timers.length+'</strong>'+
    (expired?' <span class="overdue">Готово: '+expired+'</span>':active?' <span>Идут: '+active+'</span>':'')+'</summary><div class="dock-list">'+timers.map(timer=>timerCard(timer,false)).join('')+'</div></details>';
  if (focused?.dataset.do && details?.contains(focused)) {
    [...dock.querySelectorAll('[data-do]')].find(el=>el.dataset.do===focused.dataset.do && el.dataset.id===focused.dataset.id)?.focus();
  }
}
function tick() {
  if (!state?.session) return;
  const now=Date.now();
  renderDock();
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
    field('JSON из чата',area('json','','rows="5" maxlength="10485760" required placeholder="Вставьте рецепт или набор рецептов из ChatGPT"'))+
    '<button class="btn primary">Проверить текст</button></form><hr class="import-divider">'+fileForm+'</div>');
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

async function checkGitHub() {
  const control=document.querySelector('[data-do="check-github"]');
  const label=control?.innerHTML;
  if (control) {
    control.disabled=true;
    control.setAttribute('aria-busy','true');
    control.textContent='Проверяем GitHub…';
  }
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
    if (issues.length) {
      const list=issues.slice(0,12).map(({name,message})=>'<li>'+h(name)+' — '+h(message)+'</li>').join('');
      showDialog('Проверка GitHub','<p>'+h(details)+'</p><p>Файлов с ошибками: '+issues.length+'.</p><ul class="error-list">'+list+'</ul>');
    } else say(details);
  } finally {
    if (control?.isConnected) {
      control.disabled=false;
      control.removeAttribute('aria-busy');
      control.innerHTML=label;
    }
  }
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
  if (action.startsWith('editor-')) {
    await updateDraft(document.querySelector('#editor-form'),draft,action.slice(7),id);
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
    case 'start': await startCooking(id); return;
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
      await change(current=>addShoppingBatch(current,recipe,getPortions(recipe)));
      say('Блюдо добавлено отдельным списком');
      return;
    case 'export-recipe': saveFile(id+'.json',recipe); return;
    case 'export-all': saveFile('moya-kuhnya-recipes.json',{format:'moya-kuhnya-recipes',version:1,recipes:catalogItems()}); return;
    case 'import': {
      const menu=document.querySelector('.recipe-add-menu[open]');
      if (menu) {
        menu.open=false;
        menu.querySelector('summary').focus();
      }
      fileDialog('import');
      return;
    }
    case 'check-github': await checkGitHub(); return;
    case 'restore': fileDialog('restore'); return;
    case 'backup': saveFile('moya-kuhnya-backup-'+new Date().toISOString().slice(0,10)+'.json',{format:'moya-kuhnya-backup',version:2,created:Date.now(),data:await storage.read()}); return;
    case 'restore-confirm':
      state=await storage.change(()=>restoreData);
      restoreData=null;
      dialog.close();
      say('Данные восстановлены');
      break;
    case 'shop-add': shopDialog(); return;
    case 'shop-edit': {
      const item=findShoppingList(state,id)?.find(item=>item.id===id);
      if (item) shopDialog(item);
      return;
    }
    case 'shop-delete': await change(current=>removeShoppingItem(current,id)); break;
    case 'shop-batch-delete':
      await change(current=>{current.shoppingBatches=current.shoppingBatches.filter(batch=>batch.id!==id);});
      say('Блюдо удалено из покупок');
      break;
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
    case 'cook-finish':
      await changeSession(session=>{session.elapsed=duration(session); session.activeSince=null; session.reporting=true;});
      render({focus:true}); return;
    case 'report-back': await changeSession(session=>{session.reporting=false; session.activeSince=Date.now();}); break;
    case 'cook-cancel': confirmAction('Отменить готовку?','Шаги и таймеры этой попытки будут удалены.','Отменить готовку','cook-discard'); return;
    case 'cook-discard': await changeSession((session,current)=>{current.session=null;}); dialog.close(); navigate('home'); return;
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
  if (state) unlockSound();
  const control=event.target.closest('[data-do]');
  if (control) void run(()=>onAction(control.dataset.do,control.dataset.id));
});
document.addEventListener('keydown',event=>{
  if (event.key!=='Escape' || dialog.open) return;
  const menu=document.querySelector('.recipe-add-menu[open]');
  if (menu) {
    menu.open=false;
    menu.querySelector('summary').focus();
  }
});
document.addEventListener('input',event=>{
  const target=event.target;
  if (target.closest('#filters')) {
    filters[target.name]=target.type==='checkbox'?target.checked:target.value;
    catalogResults(state,catalogItems(),filters);
  }
  if (target.name==='servings' && target.closest('.detail-body') && target.validity.valid && target.value) {
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
      await change(current=>{current.statuses=[...current.statuses.filter(item=>item.id!==target.dataset.id),{id:target.dataset.id,status:target.value}];});
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
  event.preventDefault();
  const form=event.target, data=new FormData(form);
  void run(async()=>{
    switch(form.getAttribute('id')) {
      case 'editor-form': {
        captureDraft(form,draft);
        const image=await readPhoto(form.elements.image.files[0]);
        if (image) draft.image=image;
        parseRecipes(draft,recipeSchema,exchange.bundle);
        if (event.submitter?.value==='preview') {showDialog('Предпросмотр рецепта',recipePage(state,draft,draft.servings,true));return;}
        if (event.submitter?.value==='export') {saveFile(draft.id+'.json',draft);return;}
        const saved=structuredClone(draft);
        await change(current=>{
          const recipes=[...current.recipes.filter(item=>item.id!==saved.id),saved];
          if (recipes.length>1000) throw Error('В локальном каталоге помещается до 1000 добавленных рецептов.');
          current.recipes=recipes;
        });
        portions.delete(saved.id);
        say('Рецепт сохранён');
        navigate('recipe/'+saved.id);
        return;
      }
      case 'import-file':
      case 'import-text': {
        const value=form.getAttribute('id')==='import-text'
          ? parseJsonText(data.get('json'))
          : await readJson(form.elements.file.files[0],256);
        importRows=parseRecipes(value,recipeSchema,exchange.bundle);
        importPreview(importRows);
        return;
      }
      case 'import-confirm': {
        let count=0;
        const builtInIds=new Set(builtins.map(recipe=>recipe.id));
        await change(current=>{
          const added=new Map(current.recipes.map(recipe=>[recipe.id,recipe]));
          importRows.forEach((recipe,index)=>{
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
        const session=state.session;
        const image=await readPhoto(form.elements.image.files[0]);
        const entry={id:session.id,recipeId:session.recipe.id,name:session.recipe.name,at:Date.now(),minutes:+data.get('minutes'),
          rating:+data.get('rating'),image,good:data.get('good').trim(),errors:data.get('errors').trim(),next:data.get('next').trim(),again:data.get('again')};
        await changeSession((active,current)=>{
          if(!active.reporting) throw Error('Сначала завершите готовку.');
          current.history.push(entry);
          const status=current.statuses.find(item=>item.id===entry.recipeId);
          if (!status || status.status==='new') {
            current.statuses=current.statuses.filter(item=>item.id!==entry.recipeId);
            current.statuses.push({id:entry.recipeId,status:entry.again==='yes'?'repeat':'tried'});
          }
          if (current.planned===entry.recipeId) current.planned=null;
          current.session=null;
        });
        say('Запись сохранена в дневнике');
        navigate('history/'+entry.recipeId);
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
  if (state && !main.querySelector('#editor-form,#report-form') && !dialog.open) render();
}
async function setupWorker() {
  if (!('serviceWorker' in navigator) || document.documentElement.dataset.build!=='production') return;
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
  const [ids,schema,exchangeSchema,db]=await Promise.all([json(recipeBase+'index.json'),json('./data/recipe.schema.json'),json('./data/exchange.schema.json'),openStorage()]);
  recipeSchema=schema;
  exchange=exchangeSchema.$defs;
  storage=db;
  [state,builtins]=await Promise.all([storage.read(),Promise.all(ids.map(id=>json(recipeBase+id+'.json')))]);
  featuredId='pilaf';
  onRoute();
  tick();
  void setupWorker();
} catch(error) {
  main.innerHTML=empty('Не удалось открыть «Мою кухню»',error.message,'<button class="btn primary" id="reload">Повторить</button>');
  document.querySelector('#reload').addEventListener('click',()=>location.reload());
}
