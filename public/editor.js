import { uid } from './core.js';
import { area, button, field, h, heading, input, link, photo, readPhoto } from './ui.js';

export const categories=['Горячее','Птица','Паста','Супы','Завтраки','Рыба','Гарниры','Выпечка','Салаты'];
export const groups=['Мясо и рыба','Овощи и зелень','Молочные продукты и яйца','Крупы и макароны','Специи и соусы','Бакалея','Фрукты и ягоды','Другое'];
export const newIngredient = () => ({id:uid(),name:'',quantity:1,unit:'г',group:'Бакалея',substitution:''});
export const newStep = () => ({title:'',instruction:'',ingredients:[],temperature:'',ready:'',parallel:'',timers:[]});
export const newRecipe = () => ({
  version:1,id:uid(),name:'',description:'',category:'Горячее',difficulty:1,prep:10,cook:20,servings:2,image:'',
  tools:[],ingredients:[newIngredient()],steps:[newStep()],tips:[],mistakes:[]
});
const lines = value => String(value).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const text = (name,value,max=120,required=true) => input(name,value,'maxlength="'+max+'" '+(required?'required':''));
const number = (name,value,min,max) => input(name,value,'type="number" min="'+min+'" max="'+max+'" required');
const textarea = (name,value,max,required=false) => area(name,value,'maxlength="'+max+'" '+(required?'required':''));
const datalist = (id,values) => '<datalist id="'+id+'">'+values.map(value=>'<option value="'+h(value)+'">').join('')+'</datalist>';
const mover = (kind,index,length) =>
  button('↑','editor-'+kind+'-up',{id:index,disabled:index===0})+
  button('↓','editor-'+kind+'-down',{id:index,disabled:index===length-1})+
  button('Удалить','editor-'+kind+'-delete',{id:index,kind:'quiet danger',disabled:length===1});

export function editor(recipe,original,selectedPhoto) {
  return link(original?'К рецепту':'К рецептам',original?'recipe/'+original:'recipes',{kind:'quiet'})+
    heading(original?'Редактировать рецепт':'Новый рецепт','Сохраните ингредиенты, шаги и таймеры для следующей готовки.')+
    '<form id="editor-form" class="form-stack">'+datalist('categories',categories)+datalist('groups',groups)+
    '<section class="panel padded form-stack"><h2>О блюде</h2><div class="form-grid">'+
    field('Название',text('name',recipe.name))+field('Категория',input('category',recipe.category,'list="categories" maxlength="70" required'))+
    '</div>'+field('Описание',textarea('description',recipe.description,650,true))+
    '<div class="form-grid four-fields">'+field('Порций',number('servings',recipe.servings,1,100))+field('Сложность 1–5',number('difficulty',recipe.difficulty,1,5))+
    field('Подготовка, мин',number('prep',recipe.prep,0,1440))+field('Готовка, мин',number('cook',recipe.cook,1,1440))+'</div>'+
    (recipe.image?photo(recipe.image,recipe.name,'edit-photo'):'')+
    ((recipe.image||selectedPhoto)?button('Убрать фото','editor-photo-delete',{kind:'quiet danger'}):'')+
    (selectedPhoto?'<p class="muted draft-photo">'+h(selectedPhoto.name)+'</p>':'')+
    field('Фото',input('image','','type="file" accept="image/jpeg,image/png,image/webp"'))+
    field('Посуда и инструменты, по одному на строку',textarea('tools',recipe.tools.join('\n'),4800,true))+'</section>'+
    '<section class="panel padded form-stack"><div class="section-heading"><h2>Ингредиенты</h2>'+button('Добавить','editor-ing-add',{symbol:'plus',disabled:recipe.ingredients.length>=60})+'</div>'+
    recipe.ingredients.map((item,i)=>'<fieldset class="edit-block" data-ingredient="'+i+'"><legend>Ингредиент '+(i+1)+'</legend><div class="form-grid">'+
      field('Продукт',text('item-name',item.name))+field('Количество',input('item-quantity',item.quantity,'type="number" min=".001" max="1000000" step="any" required'))+
      field('Единица',text('item-unit',item.unit,24))+field('Группа покупок',input('item-group',item.group,'list="groups" maxlength="50" required'))+'</div>'+
      field('Возможная замена',text('item-substitution',item.substitution,280,false))+
      '<div class="actions">'+mover('ing',i,recipe.ingredients.length)+'</div></fieldset>').join('')+'</section>'+
    '<section class="panel padded form-stack"><div class="section-heading"><h2>Шаги</h2>'+button('Добавить шаг','editor-step-add',{symbol:'plus',disabled:recipe.steps.length>=45})+'</div>'+
    recipe.steps.map((step,i)=>'<fieldset class="edit-block" data-step="'+i+'"><legend>Шаг '+(i+1)+'</legend>'+
      field('Название шага',text('step-title',step.title))+field('Инструкция',textarea('step-instruction',step.instruction,2400,true))+
      '<div class="form-grid">'+field('Температура или нагрев',text('step-temperature',step.temperature,200,false))+
      field('Признаки готовности',text('step-ready',step.ready,450,false))+'</div>'+
      field('Что можно сделать параллельно',text('step-parallel',step.parallel,450,false))+
      '<details '+(step.ingredients.length?'open':'')+'><summary>Продукты на шаге</summary><div class="ingredient-checks">'+
      recipe.ingredients.map((item,k)=>'<label class="toggle"><input type="checkbox" name="step-ingredient" value="'+h(item.id)+'" '+(step.ingredients.includes(item.id)?'checked':'')+'>'+h(item.name||'Ингредиент '+(k+1))+'</label>').join('')+'</div></details>'+
      step.timers.map((timer,j)=>'<div class="edit-timer" data-edit-timer><div class="form-grid">'+field('Название таймера',text('timer-name',timer.name,90))+
        field('Длительность, секунд',number('timer-seconds',timer.seconds,1,86400))+'</div>'+button('Удалить таймер','editor-timer-delete',{id:i+'-'+j,kind:'quiet danger'})+'</div>').join('')+
      '<div class="actions">'+button('Добавить таймер','editor-timer-add',{id:i,symbol:'time',disabled:step.timers.length>=8})+mover('step',i,recipe.steps.length)+'</div></fieldset>').join('')+'</section>'+
    '<section class="panel padded form-stack"><h2>Советы</h2>'+field('Советы, по одному на строку',textarea('tips',recipe.tips.join('\n'),10000))+
    field('Типичные ошибки, по одной на строку',textarea('mistakes',recipe.mistakes.join('\n'),10000))+'</section>'+
    '<div class="actions"><button class="btn primary" name="mode" value="save">Сохранить рецепт</button><button class="btn" name="mode" value="preview">Предпросмотр</button><button class="btn" name="mode" value="export">Экспортировать JSON</button>'+button('Сбросить черновик','editor-reset',{kind:'quiet danger'})+'</div></form>';
}

export function captureDraft(form,draft) {
  const get = (node,name) => node.querySelector('[name="'+name+'"]').value;
  const trim = (node,name) => get(node,name).trim();
  const data=new FormData(form);
  Object.assign(draft,{name:data.get('name').trim(),description:data.get('description').trim(),
    category:data.get('category').trim(),tools:lines(data.get('tools')),tips:lines(data.get('tips')),mistakes:lines(data.get('mistakes'))});
  for (const key of ['servings','difficulty','prep','cook']) draft[key]=Number(data.get(key));
  draft.ingredients=form.querySelectorAll('[data-ingredient]').length?[...form.querySelectorAll('[data-ingredient]')].map((node,i)=>({
    id:draft.ingredients[i].id,name:trim(node,'item-name'),quantity:Number(get(node,'item-quantity')),
    unit:trim(node,'item-unit'),group:trim(node,'item-group'),substitution:trim(node,'item-substitution')
  })):draft.ingredients;
  draft.steps=[...form.querySelectorAll('[data-step]')].map(node=>({
    title:trim(node,'step-title'),instruction:trim(node,'step-instruction'),temperature:trim(node,'step-temperature'),
    ready:trim(node,'step-ready'),parallel:trim(node,'step-parallel'),
    ingredients:[...node.querySelectorAll('[name="step-ingredient"]:checked')].map(input=>input.value),
    timers:[...node.querySelectorAll('[data-edit-timer]')].map(row=>({name:trim(row,'timer-name'),seconds:Number(get(row,'timer-seconds'))}))
  }));
  return draft;
}
export async function updateDraft(form,draft,action,id,selectedPhoto) {
  captureDraft(form,draft);
  if (action==='photo-delete') { draft.image=''; return; }
  const image=await readPhoto(form.elements.image.files[0] || selectedPhoto);
  if (image) draft.image=image;
  const [type,verb]=action.split('-');
  const [index,second]=id.split('-').map(Number);
  if (type==='timer') {
    const timers=draft.steps[index].timers;
    if (verb==='add') timers.push({name:'',seconds:60});
    else timers.splice(second,1);
    return;
  }
  const items=type==='ing'?draft.ingredients:draft.steps;
  if (verb==='add') items.push(type==='ing'?newIngredient():newStep());
  else if (verb==='delete') {
    const [removed]=items.splice(index,1);
    if (type==='ing') draft.steps.forEach(step=>{step.ingredients=step.ingredients.filter(id=>id!==removed.id);});
  } else {
    const target=index+(verb==='up'?-1:1);
    [items[index],items[target]]=[items[target],items[index]];
  }
}
