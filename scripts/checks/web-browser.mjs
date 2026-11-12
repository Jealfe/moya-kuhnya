import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4174/');await page.locator('.brand').waitFor();
for(const path of ['recipes','recipe/pilaf','shopping','history','settings']) {
 await page.goto('http://127.0.0.1:4174/#/'+path);await page.locator('main h1').waitFor();
 if(!await page.locator('main h1').count()) throw Error(path+' has no heading');
}
await page.goto('http://127.0.0.1:4174/#/recipe/pilaf');await page.locator('[data-do="start"]').click();await page.locator('.cook-step').waitFor();
await page.locator('[data-do="cook-finish"]').count() || await page.locator('[data-do="cook-step"]').last().click();
// Navigate to final step with the numbered step controls.
await page.locator('.step-nav button').last().click();await page.locator('[data-do="cook-finish"]').click();await page.locator('#report-form').waitFor();
await page.locator('[name="good"]').fill('Вкус хороший');await page.locator('[name="errors"]').fill('Мясо жёсткое');await page.locator('#report-form button[type="submit"],#report-form button:not([type])').first().click();
await page.locator('.entry').waitFor();
await page.reload();await page.locator('.entry').waitFor();
await page.goto('http://127.0.0.1:4174/#/settings');const download=page.waitForEvent('download');await page.locator('[data-do="backup"]').click();await (await download).saveAs('work/browser/backup.json');
const registrations=await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length);if(registrations!==1)throw Error('Web worker missing');
const context=await browser.newContext();await context.addInitScript(()=>{window.Capacitor={getPlatform:()=> 'android'};});const native=await context.newPage();await native.goto('http://127.0.0.1:4174/');await native.locator('.brand').waitFor();if(await native.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length))throw Error('Native worker registered');
if(errors.length)throw Error(errors.join('\n'));console.log('PASS: routes, cooking, diary persistence, backup, web/native service worker');await browser.close();
