import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:412,height:915}});
await context.addInitScript(()=>{
 window.__calls={analyze:0,connect:0,save:0,cancel:0};window.__hasKey=false;window.__invalid=false;window.__slow=false;
 const status=()=>({hasKey:window.__hasKey,model:'GigaChat-2',scope:'GIGACHAT_API_PERS'});
 window.Capacitor={getPlatform:()=> 'android',Plugins:{GigaChat:{
 status:async()=>status(),saveKey:async()=>{window.__calls.save++;window.__hasKey=true;return status();},configure:async()=>status(),deleteKey:async()=>{window.__hasKey=false;return status();},
 checkConnection:async()=>{window.__calls.connect++;return {...status(),models:['GigaChat-2']};},
 cancel:async()=>{window.__calls.cancel++;window.__reject?.(Error('Запрос отменён.'));},
 analyze:async({payload})=>{window.__calls.analyze++;window.__payload=payload;
 if(window.__slow)return new Promise((_,reject)=>window.__reject=reject);
 return {content:window.__invalid?'broken-json':'```json\n'+JSON.stringify({summary:'Учитывайте мягкость мяса',issues:[{title:'Жёсткое мясо',possibleCauses:['Возможно, мало времени тушения'],recommendations:['Проверять мягкость перед следующим шагом'],stepIndexes:[0]}],nextTimeChecklist:['Проверить отруб'],questions:[]})+'\n```'};}
 },KitchenFiles:{save:async({content})=>{window.__backup=JSON.parse(content);return {saved:true};}}}};
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4174/#/settings');await page.locator('#ai-settings').waitFor();
await page.locator('[name="gigachat-key"]').fill('dGVzdDpzZWNyZXQ=');await page.locator('#ai-settings button').click();
await page.waitForFunction(()=>window.__calls.save===1);await assert.equal(await page.locator('[name="gigachat-key"]').inputValue(),'');
await page.locator('[data-do="ai-connect"]').click();await page.getByText('Подключение работает.',{exact:false}).waitFor();
await page.evaluate(async()=>{const {openStorage}=await import('/storage.js');const recipe=await fetch('/data/recipes/pilaf.json').then(r=>r.json());const db=await openStorage();await db.change(state=>({...state,history:[{id:'ai-cook',recipeId:'pilaf',name:recipe.name,at:Date.now(),minutes:40,rating:3,image:'',good:'Вкус хороший',errors:'Мясо жёсткое',next:'Больше тушить',again:'yes',recipeSnapshot:{...recipe,image:''}}]}));});
// Reload resets the mock key flag; saving again models native persistence for this harness.
await page.reload();await page.locator('#ai-settings').waitFor();await page.locator('[name="gigachat-key"]').fill('dGVzdDpzZWNyZXQ=');await page.locator('#ai-settings button').click();await page.waitForFunction(()=>window.__calls.save===1);
await page.goto('http://127.0.0.1:4174/#/history/pilaf');await page.locator('[data-do="ai-analyze"]').waitFor();assert.equal(await page.evaluate(()=>window.__calls.analyze),0);
await page.locator('[data-do="ai-analyze"]').click();await page.locator('#dialog .ai-issue').waitFor();assert.equal(await page.evaluate(()=>window.__calls.analyze),1);
await page.locator('[data-do="ai-useful"]').first().click();await page.getByRole('button',{name:'Полезно ✓',exact:true}).waitFor();
await page.locator('#dialog [data-do="dialog-close"]').click();await page.goto('http://127.0.0.1:4174/#/recipe/pilaf');await page.getByText('На что обратить внимание в этот раз',{exact:true}).waitFor();
await page.locator('[data-do="start"]').click();await page.locator('.cook-step .ai-advice').waitFor();
await page.locator('[data-do="ai-done"]').first().click();await page.waitForFunction(()=>!document.querySelector('.cook-step .ai-advice'));assert.equal(await page.evaluate(()=>window.__calls.analyze),1);
await page.goto('http://127.0.0.1:4174/#/history/pilaf');await page.locator('[data-do="ai-view"]').click();await page.locator('#dialog .ai-issue').waitFor();assert.equal(await page.evaluate(()=>window.__calls.analyze),1);
await page.locator('#dialog [data-do="dialog-close"]').click();await page.evaluate(()=>window.__invalid=true);await page.locator('main [data-do="ai-repeat"]').click();await page.locator('#dialog').getByText('ИИ вернул невалидный JSON.',{exact:false}).waitFor();await page.locator('#dialog summary').filter({hasText:'Показать ответ ИИ'}).click();assert.equal(await page.locator('#dialog [name="ai-response"]').inputValue(),'broken-json');
await page.locator('#dialog [data-do="dialog-close"]').click();await page.evaluate(()=>{window.__invalid=false;window.__slow=true;});await page.locator('main [data-do="ai-repeat"]').click();await page.locator('[data-do="ai-cancel"]').waitFor();await page.locator('[data-do="ai-cancel"]').click();await page.locator('#dialog').getByText('Запрос отменён.',{exact:true}).waitFor();
await page.locator('#dialog [data-do="dialog-close"]').click();await page.goto('http://127.0.0.1:4174/#/settings');await page.locator('[data-do="backup"]').click();await page.waitForFunction(()=>!!window.__backup);
const backup=await page.evaluate(()=>window.__backup);assert.equal(backup.data.aiAnalyses.length,1);assert.equal(backup.data.aiAnalyses[0].feedback[0].useful,true);assert.ok(!JSON.stringify(backup).includes('dGVzdDpzZWNyZXQ='));
await page.screenshot({path:'work/browser/ai-settings.png',fullPage:true,animations:'disabled'});
await page.goto('http://127.0.0.1:4174/#/history/pilaf');await page.locator('[data-do="ai-view"]').click();await page.locator('#dialog .ai-issue').waitFor();await page.screenshot({path:'work/browser/ai-result.png',animations:'disabled'});
if(errors.length)throw Error(errors.join('\n'));
const payload=await page.evaluate(()=>window.__payload);assert.equal(payload.recipe.id,'pilaf');assert.ok(!('image' in payload.recipe));
console.log('PASS: native bridge mock, settings, no automatic analysis, manual analysis, reuse, step advice, feedback, invalid JSON, cancellation, backup without key');await browser.close();
