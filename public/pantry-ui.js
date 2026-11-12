
import { matchRecipes, productCatalog, productKey, quickProducts, splitProducts, suggestProducts, updateProducts } from './pantry.js';
import { area, h, icon } from './ui.js';

const editRoute='recipes/pantry';
const resultsRoute='recipes/pantry-results';
export const pantryMode = id => id==='pantry'?'edit':id==='pantry-results'?'results':null;

function editContent() {
  return '<form id="pantry-form" class="pantry-body">'+
    '<div class="pantry-scroll"><div class="form-stack">'+
    '<label class="field"><span>Продукты дома</span>'+area('products','','rows="2" maxlength="25000" aria-describedby="pantry-help" placeholder="Например, картошка, яйца, молоко"')+'</label>'+
    '<p class="muted" id="pantry-help">Добавляйте продукты по одному или вставьте список. Блюда с совпадениями появятся ниже.</p>'+
    '<div class="pantry-chips" data-pantry-suggestions aria-label="Подсказки"></div>'+
    '<div><button class="btn" type="button" data-pantry-add-input>Добавить в список</button></div>'+
    '<label class="toggle pantry-basics"><input type="checkbox" data-pantry-basics> Вода, соль и растительное масло есть дома</label>'+
    '<div class="pantry-chips" data-pantry-quick aria-label="Быстрое добавление" hidden></div>'+
    '<p class="error-list" data-pantry-error role="alert" hidden></p>'+
    '<section><h3>Мой список <span class="muted" data-pantry-count></span></h3><div data-pantry-list></div></section>'+
    '<section data-pantry-preview aria-label="Подходящие блюда" hidden></section>'+
    '<span class="pantry-status" role="status" data-pantry-status></span>'+
    '</div></div><div class="pantry-footer"><button class="btn primary" data-pantry-results>Смотреть рецепты</button></div></form>';
}

const noMatches='Совпадений пока нет. Попробуйте другое название или добавьте продукты.';
const isReady = ({missing,check}) => !missing.length && !check.length;

function resultCard({recipe,available,check,missing,minutes},preview) {
  const total=available.length+check.length+missing.length;
  const facts='<span><strong>'+h(recipe.name)+'</strong><small>Совпало '+(available.length+check.length)+' из '+total+
    ' · '+minutes+' мин</small>'+
    (available.length?'<small>Есть дома: '+h(available.join(', '))+'</small>':'')+
    (check.length?'<small>Уточните дома: '+h(check.join(', '))+'</small>':'')+
    (missing.length?'<small>Докупить: '+h(missing.join(', '))+'</small>':'')+'</span>';
  return '<li>'+(preview?'<div class="pantry-result">'+facts+'</div>':
    '<a href="#/recipe/'+h(recipe.id)+'/from-pantry" class="pantry-result" data-pantry-recipe>'+facts+icon('arrow')+'</a>')+'</li>';
}

function resultGroup(title,rows,preview=false) {
  return rows.length?'<section class="pantry-result-group"><h3>'+title+'</h3><ul>'+
    rows.map(row=>resultCard(row,preview)).join('')+'</ul></section>':'';
}

function resultContent(recipes,{products,useBasics}) {
  const matches=matchRecipes(recipes,products,{useBasics});
  const sections=resultGroup('Можно приготовить',matches.filter(isReady))+
    resultGroup('Блюда с вашими продуктами',matches.filter(match=>!isReady(match)));
  return '<div class="pantry-body"><div class="pantry-scroll">'+
    (sections?'<p class="muted">Выше блюда с большим числом совпадений по основным продуктам. Проверьте вид и количество по рецепту.</p>'+sections:
      '<p>'+(products.length?noMatches:'Добавьте продукты, чтобы увидеть подходящие блюда.')+'</p>')+
    '</div><div class="pantry-footer"><button class="btn primary" type="button" data-pantry-edit>Изменить список</button></div></div>';
}

export function createPantry(dialog,storage,initialPantry) {
  let {products,useBasics}=initialPantry;
  let mode=null, catalog, currentRecipes, busy=false, resultsScroll=0;
  const get = selector => dialog.querySelector(selector);
  const input = () => get('textarea');
  const error = message => {
    const box=get('[data-pantry-error]');
    if (box) {box.textContent=message;box.hidden=!message;}
  };
  const close = () => location.replace('#/recipes');
  const viewport=window.visualViewport;
  function fitViewport() {
    if (!dialog.open || !viewport || viewport.scale!==1) return;
    dialog.style.setProperty('--pantry-viewport-height',viewport.height+'px');
    dialog.style.setProperty('--pantry-keyboard-space',Math.max(0,innerHeight-viewport.height-viewport.offsetTop)+'px');
  }
  viewport?.addEventListener('resize',fitViewport);
  viewport?.addEventListener('scroll',fitViewport);

  function suggestions() {
    const text=input().value;
    const names=/[\r\n;]/.test(text)?[]:suggestProducts(text,catalog,products);
    get('[data-pantry-suggestions]').innerHTML=names.map(name=>
      '<button class="btn" type="button" data-pantry-add="'+h(name)+'">'+h(name)+'</button>').join('');
  }

  function preview() {
    const pending=splitProducts(input().value,catalog).filter(name=>catalog.has(productKey(name)));
    const matches=matchRecipes(currentRecipes,[...products,...pending],{useBasics});
    const panel=get('[data-pantry-preview]');
    panel.hidden=!products.length && !pending.length;
    const ready=matches.filter(isReady);
    const partial=matches.filter(match=>!isReady(match));
    panel.innerHTML=matches.length?
      resultGroup('Можно приготовить',ready.slice(0,1),true)+resultGroup('Блюда с вашими продуктами',partial.slice(0,ready.length?2:3),true):
      (panel.hidden?'':'<p class="muted">'+noMatches+'</p>');
    get('[data-pantry-results]').textContent=matches.length?'Смотреть рецепты ('+matches.length+')':'Смотреть рецепты';
  }

  function refresh() {
    const keys=new Set(products.map(productKey));
    get('[data-pantry-count]').textContent=products.length;
    get('[data-pantry-basics]').checked=useBasics;
    const quick=get('[data-pantry-quick]');
    quick.hidden=useBasics;
    quick.innerHTML=useBasics?'':quickProducts.map(name=>
      '<button class="btn quiet" type="button" data-pantry-add="'+h(name)+'" '+(keys.has(productKey(name))?'disabled':'')+'>+ '+h(name)+'</button>').join('');
    get('[data-pantry-list]').innerHTML=products.length?
      '<ul class="pantry-chips">'+products.map(name=>'<li><button class="btn" type="button" data-pantry-remove="'+h(name)+
        '" aria-label="Убрать '+h(name)+'">'+h(name)+' '+icon('close')+'</button></li>').join('')+'</ul>':
      '<p class="muted">Список пока пуст.</p>';
    suggestions();
    preview();
  }

  async function changeList({add=[],remove,clearInput=false,basics}={}) {
    const previous=input().value;
    const currentInput=input();
    try {
      busy=true;
      error('');
      ({products,useBasics}=await storage.changePantry(current=>({
        products:remove?current.products.filter(name=>productKey(name)!==productKey(remove)):
          add.length?updateProducts(current.products,add,catalog):current.products,
        useBasics:basics??current.useBasics
      })));
      resultsScroll=0;
      if (mode==='edit' && input()===currentInput) {
        if (clearInput && currentInput.value===previous) currentInput.value='';
        refresh();
        get('[data-pantry-status]').textContent=remove?'Удалено: '+remove:'Продуктов в списке: '+products.length;
      }
      return true;
    } catch (failure) {
      if (mode==='edit') get('[data-pantry-basics]').checked=useBasics;
      error(failure.message || 'Не удалось сохранить список.');
      return false;
    } finally {
      busy=false;
    }
  }

  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('input',event=>{if (event.target===input()) {error('');suggestions();preview();}});
  dialog.addEventListener('change',event=>{
    if (!event.target.hasAttribute('data-pantry-basics')) return;
    if (busy) {event.target.checked=useBasics;return;}
    void changeList({basics:event.target.checked});
  });
  dialog.addEventListener('click',async event=>{
    const control=event.target.closest('button,a');
    if (!control) return;
    if (control.hasAttribute('data-pantry-close')) {close();return;}
    if (control.hasAttribute('data-pantry-edit')) {location.replace('#/'+editRoute);return;}
    if (control.hasAttribute('data-pantry-recipe')) resultsScroll=get('.pantry-scroll').scrollTop;
    if (mode!=='edit' || busy) return;
    const {pantryAdd,pantryRemove,pantryAddInput}=control.dataset;
    if (pantryRemove) {
      const next=control.parentElement.nextElementSibling?.firstElementChild?.dataset.pantryRemove;
      await changeList({remove:pantryRemove});
      if (mode==='edit' && !control.isConnected) {
        ([...get('[data-pantry-list]').querySelectorAll('button')].find(item=>item.dataset.pantryRemove===next) ?? input()).focus();
      }
    } else if (pantryAdd || pantryAddInput!==undefined) {
      const names=pantryAdd?[pantryAdd]:splitProducts(input().value,catalog);
      if (!names.length) {error('Введите название продукта.');input().focus();return;}
      const clearInput=pantryAddInput!==undefined || control.parentElement.hasAttribute('data-pantry-suggestions');
      await changeList({add:names,clearInput});
      if (mode==='edit') (clearInput?input():get('[data-pantry-quick] button:not(:disabled)')??get('[data-pantry-add-input]')).focus();
    }
  });
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();
    if (busy) return;
    const names=splitProducts(input().value,catalog);
    if (names.length && !await changeList({add:names,clearInput:true})) return;
    if (!products.length) {error('Добавьте хотя бы один продукт.');input().focus();return;}
    if (mode==='edit' && dialog.open) location.replace('#/'+resultsRoute);
  });

  return {
    show(next,recipes) {
      if (!next) {
        if (dialog.open) dialog.close();
        mode=null;
        return;
      }
      mode=next;
      if (mode==='edit') {
        currentRecipes=recipes;
        catalog=productCatalog(recipes);
      }
      dialog.innerHTML='<div class="dialog-heading"><h2 id="pantry-title" tabindex="-1">'+
        (mode==='edit'?'Что есть дома?':'Подборка рецептов')+
        '</h2><button class="btn quiet" type="button" data-pantry-close aria-label="Закрыть">'+icon('close')+'</button></div>'+
        (mode==='edit'?editContent():resultContent(recipes,{products,useBasics}));
      if (mode==='edit') refresh();
      if (!dialog.open) dialog.showModal();
      fitViewport();
      get('#pantry-title').focus({preventScroll:true});
      if (mode==='results') get('.pantry-scroll').scrollTop=resultsScroll;
    }
  };
}
