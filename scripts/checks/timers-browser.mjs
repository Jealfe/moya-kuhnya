import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:360,height:780},isMobile:true,hasTouch:true});
  await page.addInitScript(()=>{
    window.syncedTimers=[];
    window.Capacitor={getPlatform:()=> 'android',Plugins:{KitchenTimers:{
      sync:async({timers})=>{
        window.syncedTimers=timers;
        return {enabled:true,exact:true,soundAvailable:true,silentAvailable:true};
      }
    }}};
  });
  const go=route=>page.goto('http://127.0.0.1:4174/#/'+route);
  const count=length=>page.waitForFunction(n=>window.syncedTimers.length===n,length);
  await go('recipe/pilaf');
  await page.locator('[data-do="start"]').click();
  await page.locator('.step-nav button').last().click();
  const start=page.locator('main [data-do="timer-start"]');
  await start.nth(1).waitFor();
  await start.first().click();
  await count(1);
  await start.first().click();
  await count(2);
  const timers=await page.evaluate(()=>window.syncedTimers);
  assert.notEqual(timers[0].key,timers[1].key);
  assert.match(timers[0].recipe,/Плов/);
  await page.locator('main [data-do="timer-pause"]').first().click();
  await count(1);
  await start.first().click();
  await count(2);
  await page.locator('main [data-do="timer-reset"]:not(:disabled)').first().click();
  await count(1);
  await page.locator('[data-do="cook-finish"]').click();
  await count(0);
  await go('settings/timers');
  await page.getByText('Уведомления таймеров включены.',{exact:true}).waitFor();
  console.log('PASS: independent Android timer notifications, pause, reset, finishing and permission status');
} finally {await browser.close();}
