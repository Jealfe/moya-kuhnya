import { totalTime } from './core.js';

const oven = /духов(?:к|очн)|духов(?:ом|ой)\s+шкаф|аэрогрил/i;
const pan = /сковород|сотейник|вок/i;
const otherCookware = /кастрюл|ковш|казан|мультиварк|микроволн|паровар|скороварк|гриль/i;

export function usesOven(recipe) {
  return [...recipe.tools,...recipe.steps.flatMap(step=>[step.title,step.temperature,step.instruction])]
    .some(text=>oven.test(text));
}

export function matchesQuickFilters(recipe,filters) {
  return (!filters.quick20 || totalTime(recipe)<=20) &&
    (!filters.noOven || !usesOven(recipe)) &&
    (!filters.onePan || (!usesOven(recipe) && recipe.tools.filter(tool=>pan.test(tool)).length===1 &&
      !recipe.tools.some(tool=>otherCookware.test(tool) || /две\s+сковород/i.test(tool))));
}

export function preparationTasks(recipe) {
  const first=recipe.steps[0];
  const paragraphs=first.instruction.split(/\n+/);
  const sentences=paragraphs[0].split(/(?<=[.!?])\s+/);
  const explicit=sentences.filter(text=>/^(?:разморозьте|разогрейте\s+духовку|включите\s+духовку|нарежьте|очистите|промойте|замочите|достаньте)(?=[\s,.!?;:]|$)/iu.test(text)).slice(0,3);
  return [
    {id:'ingredients',text:'Подготовить продукты по списку ингредиентов'},
    ...(recipe.tools.length?[{id:'tools',text:'Достать посуду и инвентарь',detail:recipe.tools.join(', ')}]:[]),
    ...explicit.map((text,index)=>({id:'first-'+index,text,detail:/духовк/i.test(text)?first.temperature:''}))
  ];
}

export function stepNoteKey(recipe,index) {
  const step=recipe.steps[index];
  if (recipe.steps.filter(item=>item.title===step.title).length===1) return step.title;
  return step.title+'\n'+step.instruction;
}

export const stepNote = (state,recipe,index) => state.stepNotes?.find(note=>
  note.recipeId===recipe.id && note.stepKey===stepNoteKey(recipe,index))?.text??'';

export function reminderTime(choice,custom,now=Date.now()) {
  if (choice==='hour') return now+3600000;
  if (choice==='tomorrow') {
    const tomorrow=new Date(now);
    tomorrow.setDate(tomorrow.getDate()+1);
    tomorrow.setHours(19,0,0,0);
    return tomorrow.getTime();
  }
  const at=choice==='custom' && custom?new Date(custom).getTime():NaN;
  if (!Number.isFinite(at) || at<=now) throw Error('Выберите дату и время в будущем.');
  return at;
}
