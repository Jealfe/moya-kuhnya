import { isAndroid } from './native.js';
import { plannedIds, plannedServings, activity, amount, duration, formatNumber, ordered, remaining, scaled, shoppingSections, shoppingTotals, statistics, totalTime } from './core.js';
import { matchesQuickFilters, preparationTasks, stepNote } from './cooking-extras.js';
import { actionMenu, area, button, card, clock, dateLabel, empty, field, foodList, h, heading, icon, input, link, list, photo, ratingLabel, select, stat, statusFor, statusLabels } from './ui.js';

const start = recipe => button('Начать готовить','start',{id:recipe.id,kind:'primary start-cooking',symbol:'arrow'});
const notes = entry => entry ? [['Получилось',entry.good],['Ошибки',entry.errors],['В следующий раз',entry.next]]
  .filter(([,text])=>text).map(([label,text])=>'<div class="note"><strong>'+label+'</strong><p>'+h(text)+'</p></div>').join('') : '';
const dateToday = () => new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})
  .replace(/^./,letter=>letter.toLocaleUpperCase('ru'));

export function home(state, recipes, featured) {
  const stats=statistics(state.history);
  const latest=ordered(state.history)[0];
  const byId=new Map(recipes.map(recipe=>[recipe.id,recipe]));
  const planned=plannedIds(state).map(id=>byId.get(id)).filter(Boolean);
  const mastered=recipes.filter(recipe=>statusFor(state,recipe.id)==='mastered').length;
  const resume=state.session ? '<section class="panel resume"><div><div class="kicker">Готовка в процессе</div><h2>'+h(state.session.recipe.name)+'</h2><p class="muted">'+(state.session.reporting?'Отчёт о приготовлении':'Шаг '+(state.session.step+1)+' из '+state.session.recipe.steps.length)+'</p></div>'+link('Продолжить готовку','cook',{kind:'primary',symbol:'arrow'})+'</section>' : '';
  return '<div class="today">'+h(dateToday())+'</div>'+resume+
    '<section class="hero"><div class="hero-copy"><div class="kicker">'+icon('spark')+' Блюдо дня</div><h1>Что приготовим<br>сегодня?</h1><p>'+h(featured.description)+'</p><div class="actions">'+link('Открыть рецепт','recipe/'+featured.id,{kind:'primary',symbol:'arrow'})+button('Другое блюдо','random',{kind:'ghost',symbol:'spark'})+'</div></div>'+
    '<a class="hero-art" href="#/recipe/'+h(featured.id)+'">'+(featured.image==='dish:0'?'<div class="photo"><img class="local-photo" src="./images/pilaf.jpg" alt=""></div>':photo(featured.image,featured.name))+'<span class="hero-caption"><strong>'+h(featured.name)+'</strong><small>'+icon('time')+' '+totalTime(featured)+' мин</small></span></a></section>'+
    '<section><div class="section-heading"><h2>Ваш прогресс</h2>'+link('В дневник','history',{kind:'inline-action',symbol:'arrow'})+'</div><div class="stats">'+stat('Приготовлений',stats.total,'bowl')+stat('Рецептов освоено',mastered,'check')+stat('Средняя оценка',stats.average?formatNumber(stats.average):'—','star')+'</div></section>'+
    '<section class="duo home-summary"><div class="panel home-last"><div class="home-summary-heading"><div class="kicker">Последнее блюдо</div>'+
    (latest?link('В историю','history/'+h(latest.recipeId),{kind:'inline-action',symbol:'history'}):'')+'</div>'+
    (latest?'<h3>'+h(latest.name)+'</h3><p>'+h(impressionLabel(latest))+' · '+h(dateLabel(latest.at))+'</p>':
      '<p>Здесь появится первая запись о готовке.</p>')+'</div>'+
    '<div class="panel home-plan"><div class="home-summary-heading"><div class="kicker">План готовки</div>'+
    button('Открыть план','open-plan',{kind:'inline-action',symbol:'arrow'})+'</div>'+
    (planned.length?'<ul class="home-plan-list">'+planned.map(recipe=>'<li><a href="#/recipe/'+h(recipe.id)+'"><strong>'+
      h(recipe.name)+'</strong><small>'+h(recipe.category)+'</small></a></li>').join('')+'</ul>':
      '<p>Выберите блюдо и добавьте его в план.</p>'+link('Посмотреть рецепты','recipes',{kind:'inline-action',symbol:'arrow'}))+'</div></section>'+
    '<section><div class="section-heading"><h2>Из каталога</h2>'+link('Все рецепты','recipes',{kind:'inline-action',symbol:'arrow'})+'</div><div class="cards">'+['roast-chicken','syrniki','bolognese'].map(id=>recipes.find(recipe=>recipe.id===id)).filter(Boolean).map(recipe=>card(recipe,state)).join('')+'</div></section>';
}

const plurals=new Intl.PluralRules('ru');
export const dishCount = count => count+' '+({one:'блюдо',few:'блюда',many:'блюд'}[plurals.select(count)]??'блюд');
export const planShoppingLabel = count => count?'Добавить в покупки · '+dishCount(count):'Добавить в покупки';

export function planSheet(state,recipes,selected) {
  const existing=new Set(state.shoppingBatches.map(batch=>batch.recipeId));
  const count=recipes.filter(recipe=>!existing.has(recipe.id) && (!selected || selected.has(recipe.id))).length;
  if (!recipes.length) return '<p>В плане пока пусто.</p>'+link('К рецептам','recipes',{kind:'primary'});
  return '<form id="plan-shopping-form" class="plan-form"><div class="plan-scroll"><p class="muted">Выберите блюда для покупок.</p>'+
    '<ul class="cooking-plan">'+recipes.map(recipe=>{
      const id=h(recipe.id);
      const already=existing.has(recipe.id);
      const checked=!already && (!selected || selected.has(recipe.id));
      return '<li><input type="checkbox" name="recipe" value="'+id+'" aria-label="Выбрать для покупок: '+h(recipe.name)+'" '+
        (already?'disabled':checked?'checked':'')+'><a href="#/recipe/'+id+'">'+h(recipe.name)+'<small>'+h(recipe.category)+
        ' · Порций: '+plannedServings(state,recipe)+(already?' · Уже в списке':'')+'</small></a>'+
        button('Убрать','plan-sheet-remove',{id:recipe.id,kind:'inline-action plan-remove',symbol:'minus'})+'</li>';
    }).join('')+'</ul></div><div class="plan-footer"><button class="btn primary" data-plan-submit '+(!count?'disabled':'')+'>'+
    planShoppingLabel(count)+'</button><a class="btn inline-action" href="#/shopping">К покупкам'+icon('arrow')+'</a></div></form>';
}

export const quickFilterLabels = {quick20:'До 20 минут',noOven:'Без духовки',onePan:'В одной сковороде'};
export function catalog(recipes,filters,checkingGitHub) {
  const categories=[...new Set(recipes.map(recipe=>recipe.category))];
  const quickCount=Object.keys(quickFilterLabels).filter(key=>filters[key]).length;
  return '<div class="catalog-title"><h1>Рецепты</h1><details class="recipe-add-menu">'+
    '<summary class="btn quiet" aria-label="Действия с рецептами" title="Действия с рецептами"><span aria-hidden="true">⋯</span></summary><div class="panel recipe-add-actions">'+
    link('Новый рецепт','editor',{symbol:'plus'})+button('Импорт','import',{symbol:'upload'})+
    button(checkingGitHub?'Проверяем GitHub…':'Проверить GitHub','check-github',{disabled:checkingGitHub})+
    button('Экспорт всех','export-all',{symbol:'download'})+'</div></details></div>'+
    '<form id="filters" class="panel filter-panel"><div class="search">'+icon('search')+input('query',filters.query,'type="search" aria-label="Поиск рецептов" placeholder="Поиск по блюдам и продуктам"')+'</div><div class="filter-selects">'+
    field('Категория',select('category',[['','Все'],...categories.map(category=>[category,category])],filters.category))+
    field('Сложность',select('difficulty',[['','Любая'],...[1,2,3,4,5].map(n=>[n,n+' / 5'])],filters.difficulty))+
    field('Время',select('time',[['','Любое'],[30,'До 30 мин'],[60,'До 60 мин'],[90,'До 90 мин']],filters.time))+
    field('Статус',select('status',[['','Все'],...Object.entries(statusLabels)],filters.status))+
    '<label class="toggle"><input type="checkbox" name="favorite" '+(filters.favorite?'checked':'')+'> Избранное</label>'+button('Сбросить фильтры','reset-filters',{kind:'inline-action',symbol:'reset'})+'</div>'+
    '<details class="quick-filters" '+(quickCount?'open':'')+'><summary class="btn">Быстрые фильтры<span data-quick-count>'+
    (quickCount?' · '+quickCount:'')+'</span></summary><div class="quick-filter-options">'+
    Object.entries(quickFilterLabels).map(([key,label])=>'<label class="toggle"><input type="checkbox" name="'+key+'" '+
      (filters[key]?'checked':'')+'> '+label+'</label>').join('')+'</div></details></form>'+
    '<div class="catalog-options"><p id="recipe-count" class="muted" aria-live="polite"></p>'+
    link('Что есть дома?','recipes/pantry',{symbol:'bowl'})+'</div><div id="recipe-results" class="cards"></div>';
}
export function catalogMatches(state,recipes,filters) {
  const clean = value => value.toLocaleLowerCase('ru').replace(/ё/g,'е');
  const query=clean(filters.query.trim());
  return recipes.filter(recipe=>
    (!query || clean([recipe.name,recipe.description,...recipe.ingredients.map(item=>item.name)].join(' ')).includes(query)) &&
    (!filters.category || recipe.category===filters.category) && (!filters.difficulty || recipe.difficulty===+filters.difficulty) &&
    (!filters.time || totalTime(recipe)<=+filters.time) && (!filters.status || statusFor(state,recipe.id)===filters.status) &&
    (!filters.favorite || state.favorites.includes(recipe.id)) && matchesQuickFilters(recipe,filters));
}
export function catalogResults(state,recipes,filters) {
  const matches=catalogMatches(state,recipes,filters);
  const quickCount=Object.keys(quickFilterLabels).filter(key=>filters[key]).length;
  document.querySelector('[data-quick-count]').textContent=quickCount?' · '+quickCount:'';
  document.querySelector('#recipe-count').textContent='Найдено: '+matches.length;
  document.querySelector('#recipe-results').innerHTML=matches.length?matches.map(recipe=>card(recipe,state)).join(''):empty('Ничего не найдено','Попробуйте изменить поиск или фильтры.');
}
export function recipePage(state,recipe,servings,preview=false,fromPantry=false,ai=null) {
  const favorite=state.favorites.includes(recipe.id);
  const planned=plannedIds(state).includes(recipe.id);
  const history=ordered(state.history.filter(entry=>entry.recipeId===recipe.id));
  const actions=preview?'':'<div class="recipe-actions">'+start(recipe)+'<div class="recipe-secondary">'+
    button('В список покупок','recipe-shop',{id:recipe.id,symbol:'shopping'})+
    button(planned?'Убрать из плана':'Запланировать','plan',{id:recipe.id,kind:planned?'active':''})+'</div></div>';
  const heart=preview?'':'<button type="button" class="favorite '+(favorite?'selected':'')+
    '" data-do="favorite" data-id="'+h(recipe.id)+'" aria-label="Избранное" aria-pressed="'+favorite+'">'+icon('heart')+'</button>';
  const top=preview?'':'<div class="recipe-topbar">'+link(fromPantry?'К подборке':'Все рецепты',
    fromPantry?'recipes/pantry-results':'recipes',{kind:'inline-action',symbol:'back'})+
    '<details class="recipe-add-menu detail-menu"><summary class="btn quiet" aria-label="Действия с рецептом"><span aria-hidden="true">⋯</span></summary>'+
    '<div class="panel recipe-add-actions">'+link('Редактировать рецепт','editor/'+recipe.id)+'</div></details></div>';
  const portionControl='<div class="portion-control">'+
    field('Порций',input('servings',servings,'type="number" min="1" max="100" required inputmode="numeric" aria-describedby="portion-error" data-id="'+h(recipe.id)+'"'))+
    '<div class="portion-buttons"><button type="button" class="btn" data-do="portion-down" data-id="'+h(recipe.id)+'" aria-label="Уменьшить число порций">−</button>'+
    '<button type="button" class="btn" data-do="portion-up" data-id="'+h(recipe.id)+'" aria-label="Увеличить число порций">+</button></div>'+
    '<small class="portion-error" id="portion-error" hidden>Введите целое число от 1 до 100.</small></div>';
  return top+'<section class="detail-top"><div class="recipe-cover">'+photo(recipe.image,recipe.name)+heart+'</div><div class="detail-copy"><div class="kicker">'+h(recipe.category)+'</div><h1>'+h(recipe.name)+'</h1><p class="lead">'+h(recipe.description)+'</p>'+
    '<div class="pills"><span>'+icon('time')+' Подготовка '+recipe.prep+' мин</span><span>'+icon('time')+' Готовка '+recipe.cook+' мин</span><span>Сложность '+recipe.difficulty+'/5</span></div>'+actions+
    (preview?'':
    field('Статус блюда',select('recipe-status',Object.entries(statusLabels),statusFor(state,recipe.id),'data-id="'+h(recipe.id)+'"')))+
    '</div></section>'+(preview?'':ai?.beforeCooking(recipe.id)??'')+'<div class="detail-body"><section class="panel padded"><div class="section-heading"><h2>Ингредиенты</h2>'+
    (preview?'<span>'+servings+' порций</span>':portionControl)+
    '</div>'+foodList(scaled(recipe.ingredients,servings,recipe.servings))+'<h3>Что понадобится</h3>'+list(recipe.tools)+'</section>'+
    '<section class="panel padded"><h2>План приготовления</h2><ol class="steps">'+recipe.steps.map(step=>'<li><details><summary>'+h(step.title)+'</summary><p>'+h(step.instruction)+'</p>'+(step.temperature?'<p class="muted">'+h(step.temperature)+'</p>':'')+'</details></li>').join('')+'</ol>'+
    (recipe.tips.length?'<h3>Советы</h3>'+list(recipe.tips):'')+(recipe.mistakes.length?'<h3>Частые ошибки</h3>'+list(recipe.mistakes):'')+
    (recipe.source?'<p class="recipe-source">Источник для сверки · <a href="'+h(recipe.source.url)+'" target="_blank" rel="noopener noreferrer">'+h(recipe.source.title)+'</a></p>':'')+'</section></div>'+
    (history.length&&!preview?'<section class="panel padded"><div class="section-heading"><h2>Последние заметки</h2>'+link('Сравнить попытки','history/'+recipe.id,{kind:'inline-action',symbol:'arrow'})+'</div>'+notes(history[0])+(notes(history[0])?'':'<p class="muted">К последней попытке заметок нет.</p>')+'</section>':'');
}

export function timerCard(timer, template) {
  const left=remaining(timer);
  const expired=timer.end!==null && left===0;
  const running=timer.end!==null && !expired;
  const untouched=template && !timer.saved;
  return '<div class="timer-row '+(expired?'expired':'')+'" data-timer="'+h(timer.id)+'"><div><strong>'+h(timer.name)+'</strong><small class="timer-state">'+(expired?'Время вышло':running?'Идёт':untouched?'Готов к запуску':'На паузе')+'</small></div>'+
    '<span class="timer-clock">'+clock(left)+'</span><div class="timer-controls">'+button(running?'Пауза':expired?'Повторить':'Запустить','timer-'+(running?'pause':'start'),{id:timer.id,kind:running?'':'primary'})+
    actionMenu('Действия таймера: '+timer.name,button('Изменить время','timer-edit',{id:timer.id,symbol:'time'})+
      button('Сбросить таймер','timer-reset',{id:timer.id,disabled:untouched}),'timer-menu')+'</div></div>';
}

export function cookPage(state,reportDraft,ai=null) {
  const session=state.session;
  if (!session) return empty('Готовка ещё не начата','Откройте рецепт, чтобы начать.',link('К рецептам','recipes',{kind:'primary'}));
  if (session.reporting) return reportPage({id:session.id,name:session.recipe.name,minutes:Math.round(duration(session)/60000)},reportDraft,true);
  const {recipe,step:index,done,servings}=session;
  const step=recipe.steps[index];
  const preparation=preparationTasks(recipe);
  const prepDone=new Set(session.prepDone??[]);
  const prepCount=preparation.filter(task=>prepDone.has(task.id)).length;
  const personalNote=stepNote(state,recipe,index);
  const previous=ordered(state.history.filter(entry=>entry.recipeId===recipe.id))[0];
  const currentFood=scaled(recipe.ingredients,servings,recipe.servings).filter(item=>step.ingredients.includes(item.id));
  const timers=step.timers.map((timer,i)=>{
    const id=index+'-'+i;
    const saved=session.timers.find(item=>item.id===id);
    return timerCard(saved?{...saved,saved:true}:{id,name:timer.name,duration:timer.seconds,remaining:timer.seconds,end:null},true);
  }).join('');
  return link('К рецепту','recipe/'+recipe.id,{kind:'inline-action',symbol:'back'})+
    heading(recipe.name,servings+' порций · '+done.length+' из '+recipe.steps.length+' шагов отмечено',
      button(session.activeSince===null?'Продолжить':'Пауза готовки','cook-pause',{symbol:session.activeSince===null?'arrow':'pause'}))+
    (session.activeSince===null?'<div class="info">Готовка на паузе. Уже запущенные таймеры продолжают отсчёт.</div>':'')+
    '<details class="panel prep-checklist" '+(index===0 && prepCount<preparation.length?'open':'')+'><summary>Перед готовкой <small data-prep-count>'+
    prepCount+' / '+preparation.length+'</small></summary><div class="prep-items">'+
    preparation.map(task=>'<label><input type="checkbox" data-prep-task="'+task.id+'" '+(prepDone.has(task.id)?'checked':'')+
      '><span>'+h(task.text)+(task.detail?'<small>'+h(task.detail)+'</small>':'')+'</span></label>').join('')+'</div></details>'+
    (ai?.beforeCooking(recipe.id,true)??'')+
    '<div class="step-nav" aria-label="Шаги">'+recipe.steps.map((_,i)=>button(String(i+1)+(done.includes(i)?' ✓':''),'cook-step',{id:i,kind:i===index?'primary':''})).join('')+'</div>'+
    '<div class="cook-layout"><section class="panel cook-step padded"><div class="kicker">Шаг '+(index+1)+' из '+recipe.steps.length+'</div><h2>'+h(step.title)+'</h2>'+(ai?.stepAdvice(recipe.id,index)??'')+'<p class="instruction">'+h(step.instruction)+'</p>'+
    (step.temperature?'<div class="info">'+h(step.temperature)+'</div>':'')+(step.ready?'<div class="note"><strong>Как понять, что готово</strong><p>'+h(step.ready)+'</p></div>':'')+
    (step.parallel?'<div class="note"><strong>Параллельно</strong><p>'+h(step.parallel)+'</p></div>':'')+
    '<div class="step-personal-note">'+(personalNote?'<div class="note"><strong>Моя заметка</strong><p>'+h(personalNote)+'</p></div>':'')+
    button(personalNote?'Изменить заметку':'Добавить заметку','step-note',{symbol:'edit',kind:'inline-action'})+'</div>'+
    (ai?.questionButton()?'<div class="step-ai-actions">'+ai.questionButton()+'</div>':'')+(timers?'<h3>Таймеры шага</h3><div class="timer-list">'+timers+'</div>':'')+'</section>'+
    '<aside class="panel padded"><h3>Продукты на этом шаге</h3>'+(currentFood.length?foodList(currentFood):'<p class="muted">Без дополнительных продуктов.</p>')+
    (notes(previous)?'<h3>Из прошлой попытки</h3>'+notes(previous):'')+'</aside></div>'+
    '<div class="actions cook-actions">'+button('Назад','cook-step',{id:index-1,disabled:index===0,symbol:'back'})+
    button(done.includes(index)?'Снять отметку':'Отметить шаг','cook-check')+
    (index===recipe.steps.length-1?button('Завершить готовку','cook-finish',{kind:'primary',symbol:'check'}):button('Далее','cook-step',{id:index+1,kind:'primary',symbol:'arrow'}))+'</div>'+
    '<p class="muted timer-help">'+(isAndroid()?'Для сигнала на заблокированном экране включите уведомления и точные сигналы в настройках приложения.':'После закрытия страницы сигнал может не прозвучать.')+'</p>'+button('Отменить готовку','cook-cancel',{kind:'inline-action danger',symbol:'close'});
}

const impressionLabel = entry => entry.pending?'Оценка отложена':ratingLabel(entry.rating);
export function reportPage(entry,draft,legacy=false,reminder=null,canRemind=false) {
  const values={...entry,...draft};
  const later=legacy?button('Оценить позже','report-defer',{id:entry.id,kind:'inline-action',symbol:'time'}):
    link(entry.pending?'Оценить позже':'В историю','history/'+entry.recipeId,{kind:'inline-action',symbol:entry.pending?'time':'arrow'});
  return heading(!legacy&&!entry.pending?'Редактировать отзыв':'Как получилось?',entry.name,later)+
    (entry.pending && canRemind?'<div class="info review-reminder">'+(reminder?'<p>Напоминание · '+
      h(dateLabel(reminder.at))+'</p>':'')+button(reminder?'Изменить напоминание':'Напомнить об отзыве','review-reminder',{id:entry.id,symbol:'time'})+'</div>':'')+
    '<form class="panel padded form-stack" id="report-form" data-entry="'+h(entry.id)+'"><div class="form-grid">'+
    field('Затрачено, минут',input('minutes',values.minutes,'type="number" min="0" max="1000000" required'))+
    field('Приготовили бы ещё раз?',select('again',[['','Без ответа'],['yes','Да'],['no','Нет']],values.again??''))+'</div>'+
    '<fieldset class="rating"><legend>Оценка результата</legend>'+[1,2,3,4,5].map(n=>'<label title="'+n+' из 5"><input type="radio" name="rating" value="'+n+'" aria-label="'+n+' из 5" '+(+values.rating===n?'checked':'')+'>'+icon('star')+'</label>').join('')+'</fieldset>'+
    field('Фото блюда',input('image','','type="file" accept="image/jpeg,image/png,image/webp"'))+
    '<p class="muted draft-photo" '+(values.image?'':'hidden')+'>'+h(values.image?.name??'Фото сохранено')+'</p>'+
    field('Что получилось хорошо',area('good',values.good??'','maxlength="2400"'))+field('Что пошло не так',area('errors',values.errors??'','maxlength="2400"'))+
    field('Что изменить в следующий раз',area('next',values.next??'','maxlength="2400"'))+
    '<div class="actions"><button class="btn primary">Сохранить впечатления</button>'+(legacy?button('Вернуться к шагам','report-back'):'')+'</div></form>';
}

function shoppingGroups(items) {
  const groups=new Map();
  for (const item of items) {
    if (!groups.has(item.group)) groups.set(item.group,[]);
    groups.get(item.group).push(item);
  }
  return [...groups].map(([group,entries])=>'<div class="shopping-category"><h3>'+h(group)+'</h3>'+entries.map(item=>
      '<div class="shopping-row '+(item.state!=='todo'?'checked':'')+'"><label><input type="checkbox" data-item="'+h(item.id)+'" '+(item.state==='bought'?'checked':'')+'><span><strong>'+h(item.name)+'</strong><small>'+h(amount(item))+(item.state==='home'?' · Уже дома':'')+'</small></span></label><div class="actions">'+
      button(item.state==='home'?'В покупки':'Есть дома','shop-home',{id:item.id,kind:item.state==='home'?'active':''})+
      actionMenu('Действия с продуктом: '+item.name,button('Изменить','shop-edit',{id:item.id,symbol:'edit'})+
        button('Удалить','shop-delete',{id:item.id,kind:'danger'}),'shopping-menu')+'</div></div>').join('')+'</div>').join('');
}
export function shoppingPage(state) {
  const sections=shoppingSections(state);
  const atHome=sections.flatMap(section=>section.items.filter(item=>item.state==='home').map(item=>({...item,group:section.name})));
  const totals=shoppingTotals(sections);
  const count=totals.length;
  return heading('Покупки',sections.length?'Осталось купить: '+count:'Добавьте продукты из рецепта или внесите свои.',
    button('Добавить продукт','shop-add',{kind:'primary',symbol:'plus'})+button('Копировать','shop-copy',{disabled:!sections.length,kind:'inline-action',symbol:'copy'}))+
    (!sections.length?empty('Список пока пуст','Откройте рецепт и добавьте продукты в покупки.',link('К рецептам','recipes',{kind:'primary'})):
    (sections.length>1 && count?'<section class="panel padded shopping-summary"><h2>Общий итог покупок</h2>'+
      totals.map(item=>'<details><summary><span>'+h(item.name)+'</span><strong>'+h(amount(item))+'</strong></summary><ul>'+
        item.parts.map(part=>'<li><span>'+h(part.name)+(part.servings?' · Порций: '+part.servings:'')+'</span><strong>'+
          h(amount(part))+'</strong></li>').join('')+'</ul></details>').join('')+'</section>':'')+
    sections.map(section=>'<section class="panel padded shopping-group"><div class="section-heading"><div><h2>'+h(section.name)+'</h2>'+
      (section.id?'<p class="muted">Порций: '+section.servings+'</p>':'<p class="muted">Отдельные продукты</p>')+'</div>'+
      (section.id?button('Удалить блюдо','shop-batch-delete',{id:section.id,kind:'inline-action danger',symbol:'minus'}):'')+'</div>'+
      shoppingGroups(section.items.filter(item=>item.state!=='home'))+'</section>').join('')+
    (atHome.length?'<section class="panel padded shopping-at-home"><h2>Есть дома</h2>'+shoppingGroups(atHome)+'</section>':''));
}

export const goalLabels = {monthly:'Приготовлений за месяц',new:'Новых блюд за месяц',retry:'Повторить неудачные блюда'};
export function historyPage(state,recipeId,period,ai=null,findRecipe,canRemind=false) {
  const history=ordered(state.history);
  const entries=recipeId?history.filter(item=>item.recipeId===recipeId):history;
  const pending=entries.filter(entry=>entry.pending);
  const stats=statistics(history);
  const points=activity(history,period);
  const chartMax=Math.max(1,...points.map(point=>point.count));
  return (recipeId?link('Весь дневник','history',{kind:'inline-action',symbol:'back'}):'')+
    heading(recipeId?(entries[0]?.name??'Попытки'):'Кулинарный дневник',recipeId?'Сравните оценки, фотографии и заметки.':'Следите за практикой и сохраняйте наблюдения.',
      recipeId?'':button('Настроить цели','goals',{symbol:'trend'}))+
    (pending.length?'<div class="info pending-impressions">'+(pending.length===1?'Ждёт оценки: '+h(pending[0].name):'Блюд ждут оценки: '+pending.length)+link('Оценить','impression/'+pending[0].id,{kind:'inline-action',symbol:'edit'})+'</div>':'')+
    (recipeId?'':'<div class="stats four">'+stat('Всего',stats.total,'bowl')+stat('Уникальных блюд',stats.unique,'recipes')+stat('Повторных попыток',stats.repeats,'history')+stat('Средняя оценка',stats.average?formatNumber(stats.average):'—','star')+'</div>'+
      '<div class="duo"><section class="panel padded"><div class="section-heading activity-heading"><h2>Активность</h2>'+select('period',[['week','По неделям'],['month','По месяцам']],period,'aria-label="Период активности"')+'</div><div class="chart">'+points.map(point=>'<div><strong>'+point.count+'</strong><span class="bar" style="--bar:'+Math.max(3,point.count/chartMax*100)+'%"></span><small>'+h(point.label)+'</small></div>').join('')+'</div></section>'+
      '<section class="panel padded"><h2>Цели на месяц</h2>'+Object.entries(goalLabels).map(([key,label])=>state.goals[key]?'<label class="goal"><span>'+label+'</span><strong>'+stats[key]+' / '+state.goals[key]+'</strong><progress value="'+Math.min(stats[key],state.goals[key])+'" max="'+state.goals[key]+'"></progress></label>':'').join('')+(Object.values(state.goals).some(Boolean)?'':'<p class="muted">Установите свою первую цель.</p>')+'</section></div>'+
      (history.length?'<div class="duo"><section class="panel padded"><h2>Готовите чаще всего</h2>'+list(stats.popular.slice(0,5).map(item=>item.name+' · '+item.count))+'</section><section class="panel padded"><h2>Изменение оценок</h2>'+(stats.change.length?list(stats.change.map(item=>item.name+' · '+item.from+' → '+item.to)):'<p class="muted">Появится после двух оценённых попыток одного блюда.</p>')+'</section></div>':''))+
    '<section><div class="section-heading"><h2>Попытки</h2></div>'+(entries.length?'<div class="entry-grid">'+entries.map(entry=>'<article class="panel entry">'+
    (entry.image?photo(entry.image,'Фото готового блюда «'+entry.name+'»'):'')+'<div class="padded"><span class="kicker">'+h(dateLabel(entry.at))+'</span><h3>'+
    (findRecipe?.(entry.recipeId)?'<a class="history-recipe-link" href="#/recipe/'+h(entry.recipeId)+'">'+h(entry.name)+'</a>':h(entry.name))+'</h3>'+
    '<div class="pills"><span>'+icon('star')+' '+impressionLabel(entry)+'</span><span>'+entry.minutes+' мин</span>'+(entry.again?'<span>'+(entry.again==='yes'?'Хочу повторить':'Не хочу повторять')+'</span>':'')+'</div>'+
    notes(entry)+(ai?.entryControls(entry)??'')+'<div class="entry-footer">'+
    link(entry.pending?'Оценить':'Править','impression/'+entry.id,{kind:entry.pending?'primary':'inline-action entry-footer-link',symbol:'edit'})+
    (recipeId?'':link('Все попытки','history/'+entry.recipeId,{kind:'inline-action entry-footer-link',symbol:'arrow'}))+
    '<details class="recipe-add-menu entry-menu"><summary class="btn" aria-label="Действия с записью">⋯</summary>'+
    '<div class="panel recipe-add-actions">'+(entry.pending && canRemind?
      button(state.reviewReminders?.some(reminder=>reminder.entryId===entry.id)?'Изменить напоминание':'Напомнить об отзыве','review-reminder',{id:entry.id,symbol:'time'}):'')+
    button('Удалить запись','history-delete',{id:entry.id,kind:'danger'})+
    '</div></details></div></div></article>').join('')+'</div>':
    empty('Записей пока нет','Завершите готовку и сохраните первый результат.',link('К рецептам','recipes',{kind:'primary'})))+'</section>';
}

const settingsTabs=[['app','Приложение','settings'],['timers','Таймеры','time'],['ai','ИИ','spark'],['copies','Копии','download']];

export function settingsPage(state,{section,offline,install,ai,timers,autoBackup}) {
  const active=settingsTabs.find(([id])=>id===section)?.[0]??'app';
  const tabs='<nav class="settings-tabs" aria-label="Разделы настроек">'+settingsTabs.map(([id,label,symbol])=>
    '<a href="#/settings/'+id+'"'+(id===active?' aria-current="page"':'')+'>'+icon(symbol)+'<span>'+label+'</span></a>'
  ).join('')+'</nav>';
  let content;
  switch(active) {
    case 'timers':
      content='<section class="panel padded form-stack"><h2>Готовка и таймеры</h2>'+
        '<label class="toggle"><input type="checkbox" name="sound" '+(state.settings.sound?'checked':'')+'> Звуковой сигнал таймеров</label>'+
        '<label class="toggle"><input type="checkbox" name="wake" '+(state.settings.wake?'checked':'')+'> Не гасить экран во время готовки</label>'+
        '<p class="muted">Удержание экрана зависит от устройства и режима энергосбережения.</p>'+
        (isAndroid()?'':'<p class="muted">После закрытия страницы используйте системный таймер телефона.</p>')+'</section>'+timers;
      break;
    case 'ai':
      content=ai;
      break;
    case 'copies':
      content='<section class="panel padded form-stack"><h2>Резервная копия</h2>'+
        '<p>Сохраните данные в файл, чтобы восстановить их после переустановки или перенести на другое устройство.</p>'+
        '<div class="settings-copy-actions">'+button('Скачать копию','backup',{symbol:'download',kind:'primary'})+
        '<div class="entry-ai settings-action-list">'+button('Восстановить из файла','restore',{kind:'entry-ai-sub',symbol:'upload'})+
        (isAndroid()?button('Поделиться копией','backup-share',{kind:'entry-ai-sub',symbol:'arrow'}):'')+'</div></div></section>'+autoBackup;
      break;
    default:
      content='<section class="panel padded form-stack"><h2>Оформление</h2>'+
        field('Тема',select('theme',[['dark','Тёмная'],['light','Светлая'],['atlas','Атлас']],state.settings.theme))+'</section>'+
        '<section class="panel padded form-stack"><h2>Установка и офлайн</h2><p>'+h(offline)+'</p>'+
        (isAndroid()?'':install?button('Установить приложение','install',{kind:'primary'}):
          '<p class="muted">В Chrome на Android откройте меню ⋮ и выберите установку или добавление на главный экран.</p>')+'</section>';
  }
  return heading('Настройки')+tabs+'<div class="settings-content">'+content+'</div>';
}
