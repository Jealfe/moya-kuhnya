import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activity, addShopping, changeTimer, duration, initialState, parseBackup, parseRecipes, remaining, scaled, sessionFor, statistics } from '../public/core.js';

const read = path => JSON.parse(readFileSync(new URL('../public/data/'+path,import.meta.url),'utf8'));
const schema=read('recipe.schema.json');
const {bundle,backup}=read('exchange.schema.json').$defs;
const ids=read('recipes/index.json');
const recipes=ids.map(id=>read('recipes/'+id+'.json'));
const recipe=recipes[0];

test('каталог из 20 уникальных рецептов проходит проверку формата и связей',()=>{
  assert.equal(new Set(ids).size,20);
  assert.deepEqual(recipes.map(recipe=>recipe.id),ids);
  recipes.forEach((recipe,index)=>{
    assert.deepEqual(parseRecipes(recipe,schema,bundle),[recipe]);
    assert.equal(recipe.image,'dish:'+index);
    assert.ok(recipe.steps.some(step=>step.timers.length));
    assert.ok(recipe.ingredients.some(item=>item.substitution));
  });
});

test('порции пересчитываются без округления и изменения исходных ингредиентов',()=>{
  const before=structuredClone(recipe.ingredients);
  const third=scaled(before,1,3);
  assert.equal(third[0].quantity,before[0].quantity/3);
  assert.deepEqual(before,recipe.ingredients);
});

test('покупки объединяют совместимые единицы и не меняют уже купленное',()=>{
  let id=0;
  const items=[
    {name:'Мука',quantity:.5,unit:'кг',group:'Бакалея'},
    {name:' мука ',quantity:250,unit:'г',group:'Бакалея'},
    {name:'Мука',quantity:2,unit:'ст. л.',group:'Бакалея'},
    {name:'Мука',quantity:1,unit:'ч. л.',group:'Бакалея'},
    {name:'Молоко',quantity:.5,unit:'л',group:'Молочное'},
    {name:'Молоко',quantity:250,unit:'мл',group:'Молочное'}
  ];
  const old=[{...items[1],id:'bought',state:'bought'}];
  const result=addShopping(old,items,()=>String(++id));
  assert.deepEqual(result.map(({quantity,unit})=>[quantity,unit]),[[250,'г'],[750,'г'],[7,'ч. л.'],[750,'мл']]);
  assert.equal(old.length,1);
});

test('таймеры независимы и восстанавливаются из абсолютного срока',()=>{
  const template={id:'timer',duration:60,end:null,remaining:60};
  const one=changeTimer(template,'start',1000);
  const two=changeTimer({...template,id:'two'},'start',6000);
  const restored=JSON.parse(JSON.stringify([one,two]));
  assert.equal(remaining(restored[0],22001),39);
  assert.equal(remaining(restored[1],22001),44);
  const paused=changeTimer(restored[0],'pause',23000);
  assert.equal(remaining(paused,999000),38);
  const edited=changeTimer(paused,'adjust',999000,22);
  assert.equal(edited.end,null);
  assert.equal(edited.remaining,60);
  assert.equal(changeTimer(edited,'reset').remaining,60);
  assert.equal(remaining(two,90000),0);
});
test('пауза приготовления исключается из затраченного времени',()=>{
  const s=sessionFor(recipe,4,1000,'one');
  s.elapsed=duration(s,11000);
  s.activeSince=null;
  assert.equal(duration(s,31000),10000);
  s.activeSince=31000;
  assert.equal(duration(s,41000),20000);
});
test('валидируется набор рецептов и диагностируются ошибки с путями',()=>{
  assert.equal(parseRecipes({format:'moya-kuhnya-recipes',version:1,recipes},schema,bundle).length,20);
  const broken=structuredClone(recipe);
  delete broken.name;
  assert.throws(()=>parseRecipes(broken,schema,bundle),/\.name.*обязательное/);
  broken.name='Плов';
  broken.steps[0].ingredients.push('absent');
  assert.throws(()=>parseRecipes(broken,schema,bundle),/ingredients.*существующие ID/);
  broken.version=2;
  assert.throws(()=>parseRecipes(broken,schema,bundle),/version/);
});

test('резервная копия проверяет вложенные данные и содержит текущую готовку',()=>{
  const data=initialState();
  data.recipes=[recipe];
  data.session=sessionFor(recipe,4,1000,'session-1');
  const copy={format:'moya-kuhnya-backup',version:1,created:9000,data};
  assert.deepEqual(parseBackup(copy,backup),data);
  data.session.step=41;
  assert.throws(()=>parseBackup(copy,backup),/неверный номер шага/);
  data.session.step=0;
  data.settings.sound='yes';
  assert.throws(()=>parseBackup(copy,backup),/settings.sound/);
});
test('история учитывает повтор, улучшение, месяц и первую попытку',()=>{
  const at=(month,day)=>new Date(2026,month,day,12).getTime();
  const entries=[
    {recipeId:'pilaf',name:'Плов',at:at(0,27),rating:2,again:'no'},
    {recipeId:'pilaf',name:'Плов',at:at(1,3),rating:4},
    {recipeId:'soup',name:'Суп',at:at(1,3),rating:0}
  ];
  const now=at(1,4);
  const stats=statistics(entries,now);
  assert.deepEqual([stats.total,stats.unique,stats.repeats,stats.average,stats.monthly,stats.new,stats.retry],[3,2,1,3,2,1,1]);
  assert.deepEqual(stats.change,[{name:'Плов',from:2,to:4}]);
  assert.equal(activity(entries,'month',now).at(-1).count,2);
  assert.equal(activity(entries,'week',now).at(-1).count,2);
});
