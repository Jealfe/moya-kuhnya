
import { matchRecipes, productCatalog, productKey, quickProducts, splitProducts, suggestProducts, updateProducts } from './pantry.js';
import { area, h, icon } from './ui.js';

const editRoute='recipes/pantry';
const resultsRoute='recipes/pantry-results';
export const pantryMode = id => id==='pantry'?'edit':id==='pantry-results'?'results':null;

function editContent() {
  return '<form id="pantry-form" class="pantry-body">'+
    '<div class="pantry-scroll"><div class="form-stack">'+
    '<label class="field"><span>Продукты дома</span>'+area('products','','rows="2" maxlength="25000" aria-describedby="pantry-help" placeholder="Например, картошка, яйца, молоко"')+'</label>'+
    '<p class="muted" id="pantry-help">Вводите по одному или вставьте список через запятую или с новой строки.</p>'+
    '<div class="pantry-chips" data-pantry-suggestions aria-label="Подсказки"></div>'+
    '<div><button class="btn" type="button" data-pantry-add-input>Добавить в список</button></div>'+
    '<div class="pantry-chips" data-pantry-quick aria-label="Быстрое добавление"></div>'+
    '<p class="error-list" data-pantry-error role="alert" hidden></p>'+
    '<section><h3>Мой список <span class="muted" data-pantry-count></span></h3><div data-pantry-list></div></section>'+
    '<span class="pantry-status" role="status" data-pantry-status></span>'+
    '</div></div><div class="pantry-footer"><button class="btn primary">Подобрать рецепты</button></div></form>';
}

function resultContent(recipes,products) {
  const matches=matchRecipes(recipes,products);
  const groups=['Можно приготовить','Не хватает одного продукта','Не хватает двух продуктов'];
  const sections=groups.map((title,index)=>{
    const rows=matches.filter(match=>match.missing.length===index);
    if (!rows.length) return '';
    return '<section class="pantry-result-group"><h3>'+title+' <span class="muted">'+rows.length+'</span></h3><ul>'+
      rows.map(({recipe,missing,minutes})=>'<li><a href="#/recipe/'+h(recipe.id)+'/from-pantry" class="pantry-result" data-pantry-recipe>'+
        '<span><strong>'+h(recipe.name)+'</strong><small>'+minutes+' мин'+(missing.length?' · Нужно: '+h(missing.join(', ')):'')+'</small></span>'+
        icon('arrow')+'</a></li>').join('')+'</ul></section>';
  }).join('');
  const empty=products.length?'Нет блюд с таким набором. Добавьте другие продукты, которые есть дома.':'Добавьте продукты, чтобы увидеть подходящие блюда.';
  return '<div class="pantry-body"><div class="pantry-scroll">'+
    (sections?'<p class="muted">Проверьте количество продуктов по рецепту.</p>'+sections:'<p>'+empty+'</p>')+
    '</div><div class="pantry-footer"><button class="btn primary" type="button" data-pantry-edit>Изменить список</button></div></div>';
}

export function createPantry(dialog,storage,initialProducts) {
  let products=initialProducts;
  let mode=null, catalog, busy=false, resultsScroll=0;
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

  function refresh() {
    const keys=new Set(products.map(productKey));
    get('[data-pantry-count]').textContent=products.length;
    get('[data-pantry-quick]').innerHTML=quickProducts.map(name=>
      '<button class="btn quiet" type="button" data-pantry-add="'+h(name)+'" '+(keys.has(productKey(name))?'disabled':'')+'>+ '+h(name)+'</button>').join('');
    get('[data-pantry-list]').innerHTML=products.length?
      '<ul class="pantry-chips">'+products.map(name=>'<li><button class="btn" type="button" data-pantry-remove="'+h(name)+
        '" aria-label="Убрать '+h(name)+'">'+h(name)+' '+icon('close')+'</button></li>').join('')+'</ul>':
      '<p class="muted">Список пока пуст.</p>';
    suggestions();
  }

  async function changeList({add=[],remove,clearInput=false}) {
    const previous=input().value;
    const currentInput=input();
    try {
      busy=true;
      error('');
      products=await storage.changePantry(current=>remove?
        current.filter(name=>productKey(name)!==productKey(remove)):updateProducts(current,add,catalog));
      resultsScroll=0;
      if (mode==='edit' && input()===currentInput) {
        if (clearInput && currentInput.value===previous) currentInput.value='';
        refresh();
        get('[data-pantry-status]').textContent=remove?'Удалено: '+remove:'Продуктов в списке: '+products.length;
      }
      return true;
    } catch (failure) {
      error(failure.message || 'Не удалось сохранить список.');
      return false;
    } finally {
      busy=false;
    }
  }

  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('input',event=>{if (event.target===input()) {error('');suggestions();}});
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
      if (mode==='edit') catalog=productCatalog(recipes);
      dialog.innerHTML='<div class="dialog-heading"><h2 id="pantry-title" tabindex="-1">'+
        (mode==='edit'?'Что есть дома?':'Подборка рецептов')+
        '</h2><button class="btn quiet" type="button" data-pantry-close aria-label="Закрыть">'+icon('close')+'</button></div>'+
        (mode==='edit'?editContent():resultContent(recipes,products));
      if (mode==='edit') refresh();
      if (!dialog.open) dialog.showModal();
      fitViewport();
      get('#pantry-title').focus({preventScroll:true});
      if (mode==='results') get('.pantry-scroll').scrollTop=resultsScroll;
    }
  };
}
