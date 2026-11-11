import { activity, amount, duration, formatNumber, ordered, remaining, scaled, shoppingSections, statistics, totalTime } from './core.js';
import { area, button, card, clock, dateLabel, empty, field, foodList, h, heading, icon, input, link, list, photo, ratingLabel, select, stat, statusFor, statusLabels } from './ui.js';

const start = recipe => button('Начать готовить','start',{id:recipe.id,kind:'primary',symbol:'arrow'});
const notes = entry => entry ? [['Получилось',entry.good],['Ошибки',entry.errors],['В следующий раз',entry.next]]
  .filter(([,text])=>text).map(([label,text])=>'<div class="note"><strong>'+label+'</strong><p>'+h(text)+'</p></div>').join('') : '';
const dateToday = () => new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})
  .replace(/^./,letter=>letter.toLocaleUpperCase('ru'));

export function home(state, recipes, featured) {
  const stats=statistics(state.history);
  const latest=ordered(state.history)[0];
  const planned=recipes.find(recipe=>recipe.id===state.planned);
  const mastered=recipes.filter(recipe=>statusFor(state,recipe.id)==='mastered').length;
  const resume=state.session ? '<section class="panel resume"><div><div class="kicker">Готовка в процессе</div><h2>'+h(state.session.recipe.name)+'</h2><p class="muted">'+(state.session.reporting?'Отчёт о приготовлении':'Шаг '+(state.session.step+1)+' из '+state.session.recipe.steps.length)+'</p></div>'+link('Продолжить готовку','cook',{kind:'primary',symbol:'arrow'})+'</section>' : '';
  return '<div class="today">'+h(dateToday())+'</div>'+resume+
    '<section class="hero"><div class="hero-copy"><div class="kicker">'+icon('spark')+' Блюдо дня</div><h1>Что приготовим<br>сегодня?</h1><p>'+h(featured.description)+'</p><div class="actions">'+start(featured)+button('Другое блюдо','random',{kind:'ghost',symbol:'spark'})+'</div></div>'+
    '<a class="hero-art" href="#/recipe/'+h(featured.id)+'">'+(featured.image==='dish:0'?'<div class="photo"><img class="local-photo" src="./images/pilaf.jpg" alt=""></div>':photo(featured.image,featured.name))+'<span class="hero-caption"><strong>'+h(featured.name)+'</strong><small>'+icon('time')+' '+totalTime(featured)+' мин</small></span></a></section>'+
    '<section><div class="section-heading"><h2>Ваш прогресс</h2><a href="#/history">В дневник '+icon('arrow')+'</a></div><div class="stats">'+stat('Приготовлений',stats.total,'bowl')+stat('Рецептов освоено',mastered,'check')+stat('Средняя оценка',stats.average?formatNumber(stats.average):'—','star')+'</div></section>'+
    '<section class="duo"><div class="panel mini"><div class="kicker">Последнее блюдо</div>'+(latest?'<h3>'+h(latest.name)+'</h3><p>'+h(ratingLabel(latest.rating))+' · '+h(dateLabel(latest.at))+'</p>'+link('Открыть историю','history/'+h(latest.recipeId),{kind:'quiet'}):'<p>Здесь появится первая запись о готовке.</p>')+'</div>'+
    '<div class="panel mini"><div class="kicker">Готовим следующим</div>'+(planned?'<h3>'+h(planned.name)+'</h3>'+link('Открыть рецепт','recipe/'+h(planned.id),{kind:'quiet'}):'<p>Выберите блюдо и добавьте его в план.</p>'+link('Посмотреть рецепты','recipes',{kind:'quiet'}))+'</div></section>'+
    '<section><div class="section-heading"><h2>Из каталога</h2><a href="#/recipes">Все рецепты '+icon('arrow')+'</a></div><div class="cards">'+['roast-chicken','syrniki','bolognese'].map(id=>recipes.find(recipe=>recipe.id===id)).filter(Boolean).map(recipe=>card(recipe,state)).join('')+'</div></section>';
}

export function catalog(state,recipes,filters) {
  const categories=[...new Set(recipes.map(recipe=>recipe.category))];
  return heading('Рецепты','Выберите блюдо или добавьте свой рецепт.',button('Импорт','import',{symbol:'upload'})+link('Новый рецепт','editor',{kind:'primary',symbol:'plus'}))+
    '<form id="filters" class="panel filter-panel"><div class="search">'+icon('search')+input('query',filters.query,'type="search" aria-label="Поиск рецептов" placeholder="Поиск по блюдам и продуктам"')+'</div><div class="filter-selects">'+
    field('Категория',select('category',[['','Все'],...categories.map(category=>[category,category])],filters.category))+
    field('Сложность',select('difficulty',[['','Любая'],...[1,2,3,4,5].map(n=>[n,n+' / 5'])],filters.difficulty))+
    field('Время',select('time',[['','Любое'],[30,'До 30 мин'],[60,'До 60 мин'],[90,'До 90 мин']],filters.time))+
    field('Статус',select('status',[['','Все'],...Object.entries(statusLabels)],filters.status))+
    '<label class="toggle"><input type="checkbox" name="favorite" '+(filters.favorite?'checked':'')+'> Избранное</label></div></form>'+
    '<div class="section-heading"><p id="recipe-count" aria-live="polite"></p>'+button('Экспорт всех','export-all',{symbol:'download',kind:'quiet'})+'</div><div id="recipe-results" class="cards"></div>';
}
export function catalogResults(state,recipes,filters) {
  const clean = value => value.toLocaleLowerCase('ru').replace(/ё/g,'е');
  const query=clean(filters.query.trim());
  const matches=recipes.filter(recipe=>
    (!query || clean([recipe.name,recipe.description,...recipe.ingredients.map(item=>item.name)].join(' ')).includes(query)) &&
    (!filters.category || recipe.category===filters.category) && (!filters.difficulty || recipe.difficulty===+filters.difficulty) &&
    (!filters.time || totalTime(recipe)<=+filters.time) && (!filters.status || statusFor(state,recipe.id)===filters.status) &&
    (!filters.favorite || state.favorites.includes(recipe.id)));
  document.querySelector('#recipe-count').textContent='Найдено: '+matches.length;
  document.querySelector('#recipe-results').innerHTML=matches.length?matches.map(recipe=>card(recipe,state)).join(''):empty('Ничего не найдено','Попробуйте изменить поиск или фильтры.');
}
export function recipePage(state,recipe,servings,preview=false) {
  const favorite=state.favorites.includes(recipe.id);
  const planned=state.planned===recipe.id;
  const history=ordered(state.history.filter(entry=>entry.recipeId===recipe.id));
  const actions=preview?'':'<div class="actions">'+start(recipe)+button('В список покупок','recipe-shop',{id:recipe.id,symbol:'shopping'})+'</div>';
  return (preview?'':link('Все рецепты','recipes',{kind:'quiet',symbol:'back'}))+
    '<section class="detail-top">'+photo(recipe.image,recipe.name)+'<div class="detail-copy"><div class="kicker">'+h(recipe.category)+'</div><h1>'+h(recipe.name)+'</h1><p class="lead">'+h(recipe.description)+'</p>'+
    '<div class="pills"><span>'+icon('time')+' Подготовка '+recipe.prep+' мин</span><span>'+icon('time')+' Готовка '+recipe.cook+' мин</span><span>Сложность '+recipe.difficulty+'/5</span></div>'+actions+
    (preview?'':'<div class="actions">'+button(favorite?'В избранном':'В избранное','favorite',{id:recipe.id,kind:favorite?'active':'',symbol:'heart'})+button(planned?'Убрать из плана':'Запланировать','plan',{id:recipe.id})+link('Редактировать','editor/'+recipe.id)+button('Экспорт','export-recipe',{id:recipe.id,symbol:'download'})+'</div>'+
    field('Статус блюда',select('recipe-status',Object.entries(statusLabels),statusFor(state,recipe.id),'data-id="'+h(recipe.id)+'"')))+
    '</div></section><div class="detail-body"><section class="panel padded"><div class="section-heading"><h2>Ингредиенты</h2>'+
    (preview?'<span>'+servings+' порций</span>':field('Порций',input('servings',servings,'type="number" min="1" max="100" inputmode="numeric" data-id="'+h(recipe.id)+'"')))+
    '</div>'+foodList(scaled(recipe.ingredients,servings,recipe.servings))+'<h3>Что понадобится</h3>'+list(recipe.tools)+'</section>'+
    '<section class="panel padded"><h2>План приготовления</h2><ol class="steps">'+recipe.steps.map(step=>'<li><details><summary>'+h(step.title)+'</summary><p>'+h(step.instruction)+'</p>'+(step.temperature?'<p class="muted">'+h(step.temperature)+'</p>':'')+'</details></li>').join('')+'</ol>'+
    (recipe.tips.length?'<h3>Советы</h3>'+list(recipe.tips):'')+(recipe.mistakes.length?'<h3>Частые ошибки</h3>'+list(recipe.mistakes):'')+
    (recipe.source?'<p class="recipe-source">Источник для сверки · <a href="'+h(recipe.source.url)+'" target="_blank" rel="noopener noreferrer">'+h(recipe.source.title)+'</a></p>':'')+'</section></div>'+
    (history.length&&!preview?'<section class="panel padded"><div class="section-heading"><h2>Последние заметки</h2>'+link('Сравнить попытки','history/'+recipe.id,{kind:'quiet'})+'</div>'+notes(history[0])+(notes(history[0])?'':'<p class="muted">К последней попытке заметок нет.</p>')+'</section>':'');
}

export function timerCard(timer, template) {
  const left=remaining(timer);
  const expired=timer.end!==null && left===0;
  const running=timer.end!==null && !expired;
  const untouched=template && !timer.saved;
  return '<div class="timer-row '+(expired?'expired':'')+'" data-timer="'+h(timer.id)+'"><div><strong>'+h(timer.name)+'</strong><small class="timer-state">'+(expired?'Время вышло':running?'Идёт':untouched?'Готов к запуску':'На паузе')+'</small></div>'+
    '<span class="timer-clock">'+clock(left)+'</span><div class="actions">'+button(running?'Пауза':expired?'Повторить':'Запустить','timer-'+(running?'pause':'start'),{id:timer.id,kind:running?'':'primary'})+
    button('Время','timer-edit',{id:timer.id})+button('Сброс','timer-reset',{id:timer.id,disabled:untouched})+'</div></div>';
}

export function cookPage(state) {
  const session=state.session;
  if (!session) return empty('Готовка ещё не начата','Откройте рецепт, чтобы начать.',link('К рецептам','recipes',{kind:'primary'}));
  if (session.reporting) return reportPage(session);
  const {recipe,step:index,done,servings}=session;
  const step=recipe.steps[index];
  const previous=ordered(state.history.filter(entry=>entry.recipeId===recipe.id))[0];
  const currentFood=scaled(recipe.ingredients,servings,recipe.servings).filter(item=>step.ingredients.includes(item.id));
  const timers=step.timers.map((timer,i)=>{
    const id=index+'-'+i;
    const saved=session.timers.find(item=>item.id===id);
    return timerCard(saved?{...saved,saved:true}:{id,name:timer.name,duration:timer.seconds,remaining:timer.seconds,end:null},true);
  }).join('');
  return link('К рецепту','recipe/'+recipe.id,{kind:'quiet',symbol:'back'})+
    heading(recipe.name,servings+' порций · '+done.length+' из '+recipe.steps.length+' шагов отмечено',
      button(session.activeSince===null?'Продолжить':'Пауза готовки','cook-pause',{symbol:session.activeSince===null?'arrow':'pause'}))+
    (session.activeSince===null?'<div class="info">Готовка на паузе. Уже запущенные таймеры продолжают отсчёт.</div>':'')+
    '<div class="step-nav" aria-label="Шаги">'+recipe.steps.map((_,i)=>button(String(i+1)+(done.includes(i)?' ✓':''),'cook-step',{id:i,kind:i===index?'primary':''})).join('')+'</div>'+
    '<div class="cook-layout"><section class="panel cook-step padded"><div class="kicker">Шаг '+(index+1)+' из '+recipe.steps.length+'</div><h2>'+h(step.title)+'</h2><p class="instruction">'+h(step.instruction)+'</p>'+
    (step.temperature?'<div class="info">'+h(step.temperature)+'</div>':'')+(step.ready?'<div class="note"><strong>Как понять, что готово</strong><p>'+h(step.ready)+'</p></div>':'')+
    (step.parallel?'<div class="note"><strong>Параллельно</strong><p>'+h(step.parallel)+'</p></div>':'')+
    (timers?'<h3>Таймеры шага</h3><div class="timer-list">'+timers+'</div>':'')+'</section>'+
    '<aside class="panel padded"><h3>Продукты на этом шаге</h3>'+(currentFood.length?foodList(currentFood):'<p class="muted">Без дополнительных продуктов.</p>')+
    (notes(previous)?'<h3>Из прошлой попытки</h3>'+notes(previous):'')+'</aside></div>'+
    '<div class="actions cook-actions">'+button('Назад','cook-step',{id:index-1,disabled:index===0,symbol:'back'})+
    button(done.includes(index)?'Снять отметку':'Отметить шаг','cook-check',{symbol:'check'})+
    (index===recipe.steps.length-1?button('Завершить готовку','cook-finish',{kind:'primary',symbol:'check'}):button('Далее','cook-step',{id:index+1,kind:'primary',symbol:'arrow'}))+'</div>'+
    '<p class="muted timer-help">После закрытия приложения сигнал может не прозвучать. Для надёжного сигнала поставьте таймер в приложении «Часы».</p>'+button('Отменить готовку','cook-cancel',{kind:'quiet danger'});
}

function reportPage(session) {
  return heading('Как получилось?',session.recipe.name)+
    '<form class="panel padded form-stack" id="report-form"><div class="form-grid">'+
    field('Затрачено, минут',input('minutes',Math.round(duration(session)/60000),'type="number" min="0" max="1000000" required'))+
    field('Приготовили бы ещё раз?',select('again',[['','Без ответа'],['yes','Да'],['no','Нет']],''))+'</div>'+
    '<fieldset class="rating"><legend>Оценка результата</legend>'+[1,2,3,4,5].map(n=>'<label title="'+n+' из 5"><input type="radio" name="rating" value="'+n+'" aria-label="'+n+' из 5">'+icon('star')+'</label>').join('')+'</fieldset>'+
    field('Фото блюда',input('image','','type="file" accept="image/jpeg,image/png,image/webp"'))+
    field('Что получилось хорошо',area('good','','maxlength="2400"'))+field('Что пошло не так',area('errors','','maxlength="2400"'))+
    field('Что изменить в следующий раз',area('next','','maxlength="2400"'))+
    '<div class="actions"><button class="btn primary">Сохранить в дневник</button>'+button('Вернуться к шагам','report-back')+'</div></form>';
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
      button('Изменить','shop-edit',{id:item.id,kind:'quiet'})+button('Удалить','shop-delete',{id:item.id,kind:'quiet danger'})+'</div></div>').join('')+'</div>').join('');
}
export function shoppingPage(state) {
  const sections=shoppingSections(state);
  const count=sections.flatMap(section=>section.items).filter(item=>item.state==='todo').length;
  return heading('Покупки',sections.length?'Осталось купить: '+count:'Добавьте продукты из рецепта или внесите свои.',
    button('Добавить продукт','shop-add',{kind:'primary',symbol:'plus'})+button('Копировать','shop-copy',{disabled:!sections.length}))+
    (!sections.length?empty('Список пока пуст','Откройте рецепт и добавьте продукты в покупки.',link('К рецептам','recipes',{kind:'primary'})):
    sections.map(section=>'<section class="panel padded shopping-group"><div class="section-heading"><div><h2>'+h(section.name)+'</h2>'+
      (section.id?'<p class="muted">Порций: '+section.servings+'</p>':'<p class="muted">Отдельные продукты</p>')+'</div>'+
      (section.id?button('Удалить блюдо','shop-batch-delete',{id:section.id,kind:'quiet danger'}):'')+'</div>'+
      shoppingGroups(section.items)+'</section>').join(''));
}

export const goalLabels = {monthly:'Приготовлений за месяц',new:'Новых блюд за месяц',retry:'Повторить неудачные блюда'};
export function historyPage(state,recipeId,period) {
  const history=ordered(state.history);
  const entries=recipeId?history.filter(item=>item.recipeId===recipeId):history;
  const stats=statistics(history);
  const points=activity(history,period);
  const chartMax=Math.max(1,...points.map(point=>point.count));
  return (recipeId?link('Весь дневник','history',{kind:'quiet',symbol:'back'}):'')+
    heading(recipeId?(entries[0]?.name??'Попытки'):'Кулинарный дневник',recipeId?'Сравните оценки, фотографии и заметки.':'Следите за практикой и сохраняйте наблюдения.',
      recipeId?'':button('Настроить цели','goals',{symbol:'trend'}))+
    (recipeId?'':'<div class="stats four">'+stat('Всего',stats.total,'bowl')+stat('Уникальных блюд',stats.unique,'recipes')+stat('Повторных попыток',stats.repeats,'history')+stat('Средняя оценка',stats.average?formatNumber(stats.average):'—','star')+'</div>'+
      '<div class="duo"><section class="panel padded"><div class="section-heading activity-heading"><h2>Активность</h2>'+select('period',[['week','По неделям'],['month','По месяцам']],period,'aria-label="Период активности"')+'</div><div class="chart">'+points.map(point=>'<div><strong>'+point.count+'</strong><span class="bar" style="--bar:'+Math.max(3,point.count/chartMax*100)+'%"></span><small>'+h(point.label)+'</small></div>').join('')+'</div></section>'+
      '<section class="panel padded"><h2>Цели на месяц</h2>'+Object.entries(goalLabels).map(([key,label])=>state.goals[key]?'<label class="goal"><span>'+label+'</span><strong>'+stats[key]+' / '+state.goals[key]+'</strong><progress value="'+Math.min(stats[key],state.goals[key])+'" max="'+state.goals[key]+'"></progress></label>':'').join('')+(Object.values(state.goals).some(Boolean)?'':'<p class="muted">Установите свою первую цель.</p>')+'</section></div>'+
      (history.length?'<div class="duo"><section class="panel padded"><h2>Готовите чаще всего</h2>'+list(stats.popular.slice(0,5).map(item=>item.name+' · '+item.count))+'</section><section class="panel padded"><h2>Изменение оценок</h2>'+(stats.change.length?list(stats.change.map(item=>item.name+' · '+item.from+' → '+item.to)):'<p class="muted">Появится после двух оценённых попыток одного блюда.</p>')+'</section></div>':''))+
    '<section><div class="section-heading"><h2>Попытки</h2></div>'+(entries.length?'<div class="entry-grid">'+entries.map(entry=>'<article class="panel entry">'+
    (entry.image?photo(entry.image,'Фото готового блюда «'+entry.name+'»'):'')+'<div class="padded"><span class="kicker">'+h(dateLabel(entry.at))+'</span><h3>'+h(entry.name)+'</h3>'+
    '<div class="pills"><span>'+icon('star')+' '+ratingLabel(entry.rating)+'</span><span>'+entry.minutes+' мин</span>'+(entry.again?'<span>'+(entry.again==='yes'?'Хочу повторить':'Не хочу повторять')+'</span>':'')+'</div>'+
    notes(entry)+(recipeId?'':link('Все попытки блюда','history/'+entry.recipeId,{kind:'quiet',symbol:'arrow'}))+'</div></article>').join('')+'</div>':
    empty('Записей пока нет','Завершите готовку и сохраните первый результат.',link('К рецептам','recipes',{kind:'primary'})))+'</section>';
}

export function settingsPage(state, offline, install) {
  return heading('Настройки','Оформление, таймеры и данные на этом устройстве.')+
    '<div class="duo"><section class="panel padded form-stack"><h2>Приложение</h2>'+
    field('Тема',select('theme',[['dark','Тёмная'],['light','Светлая']],state.settings.theme))+
    '<label class="toggle"><input type="checkbox" name="sound" '+(state.settings.sound?'checked':'')+'> Звуковой сигнал таймеров</label>'+
    '<label class="toggle"><input type="checkbox" name="wake" '+(state.settings.wake?'checked':'')+'> Не гасить экран во время готовки</label>'+
    '<p class="muted">Доступность удержания экрана зависит от браузера и устройства.</p></section>'+
    '<section class="panel padded form-stack"><h2>Установка и офлайн</h2><p>'+h(offline)+'</p>'+
    (install?button('Установить приложение','install',{kind:'primary'}):'<p class="muted">В Chrome на Android откройте меню ⋮ и выберите установку или добавление на главный экран.</p>')+
    '<p class="muted">После закрытия приложения надёжный сигнал даёт системный таймер телефона.</p></section></div>'+
    '<section class="panel padded form-stack"><h2>Резервная копия</h2><p>Рецепты, фото, покупки и дневник хранятся в этом браузере. Для переноса на другое устройство скачайте копию и откройте её там. При очистке данных браузера локальные записи могут удалиться.</p>'+
    '<div class="actions">'+button('Скачать копию','backup',{symbol:'download',kind:'primary'})+button('Восстановить из файла','restore',{symbol:'upload'})+'</div></section>';
}
