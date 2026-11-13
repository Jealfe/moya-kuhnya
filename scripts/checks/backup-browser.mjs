
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.addInitScript(()=>{
    window.backupWrites=[];
    window.Capacitor={getPlatform:()=> 'android',Plugins:{
      KitchenDevice:{
        setTheme:async()=>{},
        backupStatus:async()=>({enabled:localStorage.backup==='yes'}),
        chooseBackupFolder:async()=>{localStorage.backup='yes';return {enabled:true};},
        disableBackup:async()=>{delete localStorage.backup;},
        writeBackup:async({content})=>{window.backupWrites.push(content);return {name:'test.json'};}
      },
      GigaChat:{status:async()=>({hasKey:false,model:'GigaChat-2',scope:'GIGACHAT_API_PERS'})}
    }};
  });
  await page.goto('http://127.0.0.1:4174/#/settings');
  await page.getByRole('button',{name:'Выбрать папку',exact:true}).click();
  await page.getByText('Автокопия сохранена',{exact:true}).waitFor();
  await page.goto('http://127.0.0.1:4174/#/recipe/pilaf');
  await page.getByRole('button',{name:'Начать готовить',exact:true}).click();
  await page.getByRole('button',{name:'4',exact:true}).click();
  await page.getByRole('button',{name:'Завершить готовку',exact:true}).click();
  await page.getByLabel('Что получилось хорошо').fill('Отзыв для автокопии');
  await page.getByRole('button',{name:'Сохранить впечатления',exact:true}).click();
  await page.waitForFunction(()=>window.backupWrites.some(text=>text.includes('Отзыв для автокопии')));
  const json=await page.evaluate(()=>window.backupWrites.at(-1));
  assert.equal(JSON.parse(json).data.history.length,1);
  await page.goto('http://127.0.0.1:4174/#/settings');
  await page.reload();
  await page.getByRole('button',{name:'Отключить',exact:true}).click();
  await page.getByRole('button',{name:'Выбрать папку',exact:true}).waitFor();
  const fresh=await browser.newPage();
  await fresh.goto('http://127.0.0.1:4174/#/settings');
  await fresh.getByRole('button',{name:'Восстановить из файла'}).click();
  await fresh.locator('#dialog input[type=file]').setInputFiles({name:'auto.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await fresh.getByRole('button',{name:'Проверить файл'}).click();
  await fresh.getByRole('button',{name:'Восстановить данные'}).click();
  await fresh.getByText('Данные восстановлены',{exact:true}).waitFor();
  await fresh.goto('http://127.0.0.1:4174/#/history');
  await fresh.getByText('Отзыв для автокопии',{exact:true}).waitFor();
  console.log('PASS: automatic diary backup and restore in a new profile');
} finally {await browser.close();}
