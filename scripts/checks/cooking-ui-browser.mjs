import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:360,height:800}});
await context.addInitScript(()=>{
 window.__analysisRequests=0;
 window.Capacitor={getPlatform:()=> 'android',Plugins:{GigaChat:{status:async()=>({hasKey:true}),analyze:async()=>{window.__analysisRequests++;throw Error('Unexpected API request');}}}};
});
const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.goto('http://127.0.0.1:4174/');await page.locator('.brand').waitFor();
await page.evaluate(async()=>{
 const {initialState,sessionFor}=await import('/core.js');
 const {fingerprint,recipeData,reviewData}=await import('/ai.js');
 const {openStorage}=await import('/storage.js');
 const recipe=await fetch('/data/recipes/pilaf.json').then(r=>r.json());
 const entry={id:'cooking-advice',recipeId:recipe.id,name:recipe.name,at:1000,minutes:45,rating:3,image:'',good:'Вкусно',errors:'Лук подгорел',next:'Контролировать нагрев',again:'yes'};
 const record={id:'analysis-advice',recipeId:recipe.id,entryId:entry.id,at:2000,recipeHash:await fingerprint(recipeData(recipe)),reviewHash:await fingerprint(reviewData(entry)),feedback:[],result:{summary:'Контролируйте нагрев',
 issues:[{title:'Лук подгорел',possibleCauses:[],recommendations:['Лук: уменьшите нагрев и помешивайте.\nНе ориентируйтесь только на таймер — следите за цветом.'],stepIndexes:[1]},
 {title:'Мясо жёсткое',possibleCauses:[],recommendations:['Мясо: проверяйте мягкость перед следующим шагом.'],stepIndexes:[2]}],nextTimeChecklist:['Старый общий чек-лист'],questions:[]}};
 const state={...initialState(),history:[entry],aiAnalyses:[record],session:sessionFor(recipe,recipe.servings)};
 await (await openStorage()).change(()=>state);
});
await page.goto('http://127.0.0.1:4174/#/cook');await page.reload();await page.locator('.cook-step').waitFor();
assert.equal(await page.locator('html').getAttribute('data-platform'),'android');
assert.equal(await page.locator('meta[name=viewport]').getAttribute('content'),'width=device-width, initial-scale=1, viewport-fit=contain');
assert.ok(await page.locator('#header').evaluate(el=>el.getBoundingClientRect().top)>=6);
assert.equal(await page.locator('details.ai-plan').getAttribute('open'),null);
assert.equal(await page.locator('.cook-step .ai-step').count(),0);
await page.locator('.step-nav button').nth(1).click();await page.locator('.ai-step').waitFor();
assert.equal(await page.locator('.ai-step').getByText('Лук подгорел',{exact:true}).count(),1);
assert.equal(await page.locator('.ai-step').getByText('Мясо жёсткое',{exact:true}).count(),0);
const adviceBox=await page.locator('.ai-step').boundingBox();const instructionBox=await page.locator('.instruction').boundingBox();
assert.ok(adviceBox.y+adviceBox.height<=instructionBox.y);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.locator('.ai-step').scrollIntoViewIfNeeded();await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:'work/browser/cook-ai-360.png',animations:'disabled'});
await page.locator('.ai-step [data-do="ai-done"]').click();await page.waitForFunction(()=>!document.querySelector('.ai-step'));
await page.locator('.ai-plan summary').click();const plan=await page.locator('.ai-plan').innerText();
assert.ok(plan.includes('Мясо:'));assert.ok(!plan.includes('Лук:'));assert.ok(!plan.includes('Старый общий чек-лист'));
await page.locator('.step-nav button').nth(2).click();await page.locator('.ai-step').getByText('Мясо жёсткое',{exact:true}).waitFor();
await page.setViewportSize({width:412,height:915});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
// The active cooking snapshot must decide step hints, even if the catalogue is edited.
await page.evaluate(async()=>{const {openStorage}=await import('/storage.js');await (await openStorage()).change(state=>{
 const changed=structuredClone(state.session.recipe);changed.steps[2].instruction+=' Изменённый рецепт.';state.recipes=[changed];return state;
});});
await page.reload();await page.locator('.ai-step').getByText('Мясо жёсткое',{exact:true}).waitFor();
await page.goto('http://127.0.0.1:4174/#/recipe/pilaf');await page.locator('.detail-body').waitFor();assert.equal(await page.locator('main .ai-advice').count(),0);
assert.equal(await page.evaluate(()=>window.__analysisRequests),0);assert.deepEqual(errors,[]);
console.log('PASS: Android viewport, compact cooking plan, correct step advice, completed advice hidden, active snapshot, narrow screens, zero API requests');
await browser.close();
