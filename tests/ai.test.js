import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState, parseBackup } from '../public/core.js';
import { adviceForStep, analysisStale, buildAnalysisContext, createAnalysis, currentAdvice, latestAnalysis, parseAnalysis, recipeData, storeAnalysis } from '../public/ai.js';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const recipe=await json('../public/data/recipes/pilaf.json');
const schema=await json('../public/data/ai-result.schema.json');
const exchange=(await json('../public/data/exchange.schema.json')).$defs;
const entry=(id='cook-1',at=1000)=>({id,recipeId:recipe.id,name:recipe.name,at,minutes:35,rating:3,image:'',good:'Вкус хороший',errors:'Мясо жёсткое',next:'Проверить отруб',again:'yes'});
const result=()=>({summary:'Проверьте время тушения',issues:[{title:'Жёсткое мясо',possibleCauses:['Возможно, мало времени'],recommendations:['Проверять мягкость перед следующим шагом'],stepIndexes:[0]}],nextTimeChecklist:['Проверить отруб'],questions:['Какой отруб использовали?']});
const analyzed=async(state,attempt=state.history[0],options={})=>createAnalysis({state,entry:attempt,recipe,schema,request:async()=>({content:JSON.stringify(result())}),now:()=>2000,...options});

test('контекст содержит только текущее блюдо, температуры, таймеры и три предыдущих отзыва без фото и секретов',async()=>{
 const state=initialState();state.history=Array.from({length:8},(_,i)=>({...entry('old-'+i,i),image:'BASE64_PHOTO'}));
 state.history.push({...entry('other'),recipeId:'other-dish',good:'НЕ ОТПРАВЛЯТЬ'});state.settings.apiKey='НЕ ОТПРАВЛЯТЬ';
 const context=await buildAnalysisContext({...recipe,image:'BASE64_PHOTO'},entry(),state);const text=JSON.stringify(context);
 assert.equal(context.previousAttempts.length,3);assert.deepEqual(context.recipe.steps[0].timers,recipe.steps[0].timers);
 assert.equal(context.recipe.steps[0].temperature,recipe.steps[0].temperature);assert.equal(context.currentAttempt.errors,'Мясо жёсткое');
 assert.ok(!text.includes('BASE64_PHOTO'));assert.ok(!text.includes('НЕ ОТПРАВЛЯТЬ'));assert.ok(!text.includes('apiKey'));
 assert.equal(context.previousAttempts[0].at,7);
});
test('разбор JSON отклоняет мусор, лишние поля, неверные типы и индексы шагов',()=>{
 assert.deepEqual(parseAnalysis(JSON.stringify(result()),schema,recipe.steps.length),result());
 for(const value of ['```json\n{}\n```','not json','null',JSON.stringify({...result(),secret:'x'}),JSON.stringify({...result(),issues:[{...result().issues[0],stepIndexes:[44]}]}),JSON.stringify({...result(),questions:['1','2','3']})])assert.throws(()=>parseAnalysis(value,schema,recipe.steps.length));
});
test('анализ сохраняется отдельно от первоначального отзыва, связан с контрольными суммами',async()=>{
 const state=initialState();state.history=[entry()];const original=structuredClone(state.history[0]);
 const record=await analyzed(state);storeAnalysis(state,record);
 assert.deepEqual(state.history[0],original);assert.equal(record.recipeHash.length,64);assert.equal(record.reviewHash.length,64);
 assert.equal(latestAnalysis(state,entry().id),record);assert.equal(await analysisStale(record,entry(),recipe),false);
 assert.equal(await analysisStale(record,{...entry(),errors:'Мясо мягкое'},recipe),true);
 assert.equal(await analysisStale(record,entry(),{...recipe,steps:[{...recipe.steps[0],instruction:'Другое действие'},...recipe.steps.slice(1)]}),true);
});
test('старые копии v1/v2 и новые копии с анализами восстанавливаются без потери данных',async()=>{
 const state=initialState();state.history=[{...entry(),recipeSnapshot:{...recipe,image:''}}];storeAnalysis(state,await analyzed(state));
 const backup={format:'moya-kuhnya-backup',version:2,created:1000,data:state};
 assert.deepEqual(parseBackup(backup,exchange.backup,exchange.legacyBackup),state);
 const old=structuredClone(backup);delete old.data.aiAnalyses;delete old.data.history[0].recipeSnapshot;
 assert.deepEqual(parseBackup(old,exchange.backup,exchange.legacyBackup).aiAnalyses,[]);
 old.version=1;delete old.data.shoppingBatches;assert.deepEqual(parseBackup(old,exchange.backup,exchange.legacyBackup).aiAnalyses,[]);
 const bad=structuredClone(backup);bad.data.aiAnalyses[0].entryId='missing';assert.throws(()=>parseBackup(bad,exchange.backup,exchange.legacyBackup));
 const injected=structuredClone(backup);injected.data.apiKey='secret';assert.throws(()=>parseBackup(injected,exchange.backup,exchange.legacyBackup));
});
test('повторное чтение советов не выполняет запрос, новые анализы заменяют старые для одной попытки',async()=>{
 const state=initialState();state.history=[entry()];let calls=0;
 const record=await analyzed(state,entry(),{request:async()=>{calls++;return {content:JSON.stringify(result())};}});storeAnalysis(state,record);
 assert.equal(await currentAdvice(state,recipe),record);assert.equal(await currentAdvice(state,recipe),record);assert.equal(calls,1);
 storeAnalysis(state,{...record,id:'replacement',at:3000});assert.equal(state.aiAnalyses.length,1);
 assert.equal(latestAnalysis(state,entry().id).id,'replacement');
});
test('подсказки привязаны к шагам; выполненные скрываются и передаются в историю нового анализа',async()=>{
 const state=initialState();state.history=[entry()];const record=await analyzed(state);storeAnalysis(state,record);
 assert.equal(adviceForStep(record,0).length,1);assert.equal(adviceForStep(record,1).length,0);
 record.feedback=[{issueIndex:0,recommendationIndex:0,done:true,useful:true}];assert.equal(adviceForStep(record,0).length,0);
 const context=await buildAnalysisContext(recipe,entry('new',3000),state);assert.equal(context.previousAttempts[0].feedback[0].done,true);
 assert.deepEqual(context.previousAttempts[0].previousAnalysis,result());
});
test('актуальные советы берутся из последнего анализа; изменённый рецепт не получает старые привязки',async()=>{
 const state=initialState();state.history=[entry(),entry('new',3000)];const record=await analyzed(state);storeAnalysis(state,record);
 const newer=await analyzed(state,state.history[1],{now:()=>4000});newer.result={...result(),summary:'Новое наблюдение'};storeAnalysis(state,newer);
 assert.equal((await currentAdvice(state,recipe)).id,newer.id);
 assert.equal(await currentAdvice(state,{...recipe,description:'Изменённый рецепт'}),null);
});
test('невалидный ответ не сохраняется, удалённый отзыв не получает анализ',async()=>{
 const state=initialState();state.history=[entry()];await assert.rejects(analyzed(state,entry(),{request:async()=>({content:'broken'})}));assert.deepEqual(state.aiAnalyses,[]);
 const record=await analyzed(state);state.history=[];assert.throws(()=>storeAnalysis(state,record));
});
test('контекст ограничен целыми попытками, большие входы не отправляются',async()=>{
 const state=initialState();state.history=Array.from({length:3},(_,i)=>({...entry('old-'+i,i),good:'x'.repeat(20000)}));
 assert.ok(JSON.stringify(await buildAnalysisContext(recipe,entry(),state)).length<=38000);
 await assert.rejects(buildAnalysisContext({...recipe,description:'x'.repeat(40000)},entry(),state));
});
test('контрольная сумма рецепта не зависит от изображения и порядка свойств',()=>{
 assert.deepEqual(recipeData({...recipe,image:'another image'}),recipeData(recipe));
});

test('JSON с BOM, Markdown-обёрткой и строковой сериализацией проходит ту же схему',()=>{
 const text=JSON.stringify(result());
 for(const response of [text,'\uFEFF '+text+'\n','```json\n'+text+'\n```','```JSON\r\n'+text+'\r\n```','```\n'+text+'\n```',JSON.stringify(text),JSON.stringify('```json\n'+text+'\n```')]) {
  assert.deepEqual(parseAnalysis(response,schema,recipe.steps.length),result());
 }
});
test('обёртка не позволяет сохранить повреждённый JSON или обойти проверку схемы',()=>{
 for(const response of ['```json\n{"summary":"обрыв','Ответ: '+JSON.stringify(result()),JSON.stringify(JSON.stringify(JSON.stringify(result()))),'```js\nalert(1)\n```','```json\n{"summary":"ошибка",}\n```','```json\n'+JSON.stringify({...result(),questions:42})+'\n```']) {
  assert.throws(()=>parseAnalysis(response,schema,recipe.steps.length));
 }
});
test('ответ в блоке кода сохраняется после одного запроса без изменения отзыва',async()=>{
 const state=initialState();state.history=[entry()];const original=structuredClone(state.history[0]);let requests=0;
 const record=await analyzed(state,entry(),{request:async()=>{requests++;return {content:'```json\n'+JSON.stringify(result())+'\n```'};}});
 storeAnalysis(state,record);assert.equal(requests,1);assert.deepEqual(state.aiAnalyses[0].result,result());assert.deepEqual(state.history[0],original);
});
test('диагностика ограничена ответом модели и не сохраняется в состояние после ошибки',async()=>{
 const state=initialState();state.history=[entry()];
 await assert.rejects(analyzed(state,entry(),{request:async()=>({content:'not-json'.repeat(3000)})}),error=>{
  assert.equal(error.analysisResponse.length,12000);return true;
 });
 assert.deepEqual(state.aiAnalyses,[]);assert.equal(JSON.stringify(state).includes('not-json'),false);
});

test('повторный анализ старой попытки не вытесняет советы последней готовки',async()=>{
 const state=initialState();state.history=[entry('old',1000),entry('recent',3000)];
 const recent=await analyzed(state,state.history[1],{now:()=>4000});storeAnalysis(state,recent);
 const old=await analyzed(state,state.history[0],{now:()=>9000});storeAnalysis(state,old);
 assert.equal((await currentAdvice(state,recipe)).id,recent.id);
});
test('план и шаги исключают выполненные советы, включая частичное выполнение',async()=>{
 const {advicePlan}=await import('../public/ai.js');const state=initialState();state.history=[entry()];const record=await analyzed(state);
 record.result.issues[0].recommendations.push('Добавлять жидкость понемногу');
 record.feedback=[{issueIndex:0,recommendationIndex:0,done:true,useful:true}];
 assert.deepEqual(advicePlan(record).map(item=>item.text),['Добавлять жидкость понемногу']);
 assert.deepEqual(adviceForStep(record,0).map(item=>item.text),['Добавлять жидкость понемногу']);
 record.feedback.push({issueIndex:0,recommendationIndex:1,done:true,useful:false});assert.deepEqual(advicePlan(record),[]);
});
