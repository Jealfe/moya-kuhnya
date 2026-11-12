import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activity, addShopping, addShoppingBatch, changeTimer, duration, findShoppingList, initialState, parseBackup, parseRecipes, remaining, removeShoppingItem, scaled, sessionFor, shoppingSections, statistics } from '../public/core.js';

const read = path => JSON.parse(readFileSync(new URL('../public/data/'+path,import.meta.url),'utf8'));
const schema=read('recipe.schema.json');
const {bundle,backup,legacyBackup}=read('exchange.schema.json').$defs;
const ids=read('recipes/index.json');
const recipes=ids.map(id=>read('recipes/'+id+'.json'));
const recipe=recipes[0];

test('каталог из 70 уникальных рецептов проходит проверку формата, источников и связей',()=>{
  assert.equal(new Set(ids).size,70);
  assert.deepEqual(recipes.map(recipe=>recipe.id),ids);
  recipes.forEach((recipe,index)=>{
    assert.deepEqual(parseRecipes(recipe,schema,bundle),[recipe]);
    assert.equal(recipe.image,'dish:'+index);
    assert.ok(recipe.steps.some(step=>step.timers.length));
    assert.match(recipe.source.url,/^https:\/\//);
    assert.ok(recipe.ingredients.every(item=>recipe.steps.some(step=>step.ingredients.includes(item.id))),recipe.id);
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
  assert.equal(parseRecipes({format:'moya-kuhnya-recipes',version:1,recipes},schema,bundle).length,70);
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
  const copy={format:'moya-kuhnya-backup',version:2,created:9000,data};
  assert.deepEqual(parseBackup(copy,backup,legacyBackup),data);
  data.session.step=41;
  assert.throws(()=>parseBackup(copy,backup,legacyBackup),/неверный номер шага/);
  data.session.step=0;
  data.settings.sound='yes';
  assert.throws(()=>parseBackup(copy,backup,legacyBackup),/settings.sound/);
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

test('покупки разных блюд и повторные добавления остаются раздельными',()=>{
  const data=initialState();
  const makeId=(()=>{let id=0;return ()=>String(++id);})();
  addShoppingBatch(data,recipe,8,makeId);
  addShoppingBatch(data,recipe,4,makeId);
  const saltIds=data.shoppingBatches.map(batch=>batch.items.find(item=>item.name==='Соль').id);
  const firstSalt=findShoppingList(data,saltIds[0]).find(item=>item.id===saltIds[0]);
  firstSalt.state='bought';
  assert.equal(firstSalt.quantity,16);
  assert.equal(findShoppingList(data,saltIds[1]).find(item=>item.id===saltIds[1]).state,'todo');
  data.shoppingBatches=data.shoppingBatches.filter(batch=>batch.id!==data.shoppingBatches[0].id);
  assert.equal(findShoppingList(data,saltIds[0]),undefined);
  assert.equal(findShoppingList(data,saltIds[1]).find(item=>item.id===saltIds[1]).quantity,8);
  removeShoppingItem(data,saltIds[1]);
  assert.equal(data.shoppingBatches.length,1);
  assert.equal(findShoppingList(data,saltIds[1]),undefined);
});

test('резервная копия версии 1 сохраняет старые покупки, версия 2 сохраняет блюда',()=>{
  const data=initialState();
  const makeId=(()=>{let id=0;return ()=>String(++id);})();
  data.shopping=addShopping([],recipe.ingredients.slice(0,2),makeId);
  const {shoppingBatches:_,...old}=data;
  const legacy={format:'moya-kuhnya-backup',version:1,created:0,data:old};
  assert.deepEqual(parseBackup(legacy,backup,legacyBackup),data);
  assert.equal(shoppingSections(data)[0].name,'Общий список');
  addShoppingBatch(data,recipe,2,makeId);
  const latest={...legacy,version:2,data};
  assert.deepEqual(parseBackup(latest,backup,legacyBackup),data);
  data.shoppingBatches[0].items[0].id=data.shopping[0].id;
  assert.throws(()=>parseBackup(latest,backup,legacyBackup),/повторяются ID продуктов/);
});

test('резервная копия сохраняет отложенную оценку и автоматический статус',()=>{
  const data=initialState();
  data.history.push({id:'pending-one',recipeId:'pilaf',name:'Плов с говядиной',at:10,minutes:30,
    rating:0,image:'',good:'',errors:'',next:'',again:'',pending:true});
  data.statuses.push({id:'pilaf',status:'tried',automatic:true});
  const copy={format:'moya-kuhnya-backup',version:2,created:11,data};
  const restored=parseBackup(copy,backup,legacyBackup);
  assert.deepEqual(restored,data);
  assert.equal(statistics(restored.history).total,1);
  assert.equal(statistics(restored.history).average,0);
});
