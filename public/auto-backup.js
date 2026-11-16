
import { isAndroid, nativePlugin } from './native.js';
import { actionMenu, button, h } from './ui.js';

export function createAutoBackup({getBackup,notice}) {
  let enabled=false, initialized=false, writing=null, pending=false, lastSaved=null, failed=false, delay;
  const native = () => nativePlugin('KitchenDevice');

  function save() {
    clearTimeout(delay);
    if (!enabled) return;
    pending=true;
    if (writing) return writing;
    writing=(async()=>{
      while (pending && enabled) {
        pending=false;
        try {
          // Same versioned format as manual export. The native module alternates files.
          const content=JSON.stringify(await getBackup());
          if (new Blob([content]).size>256*1024*1024) throw Error('Автокопия превышает 256 МБ. Для восстановления приложение принимает файлы до 256 МБ.');
          await native().writeBackup({content});
          lastSaved=Date.now();
          failed=false;
          remember();
        } catch (error) {
          if (!failed) notice(error.message);
          failed=true;
          remember();
        }
      }
    })().finally(()=>{writing=null;});
    return writing;
  }

  function remember() {
    try {localStorage.setItem('auto-backup-status',JSON.stringify({lastSaved,failed}));} catch {}
  }
  return {
    schedule() {
      if (!enabled) return;
      clearTimeout(delay);
      delay=setTimeout(save,2000);
    },
    async initialize() {
      if (!isAndroid()) return;
      try {
        enabled=(await native().backupStatus()).enabled;
        initialized=true;
        try {
          const saved=JSON.parse(localStorage.getItem('auto-backup-status'));
          lastSaved=saved?.lastSaved??null;
          failed=saved?.failed===true;
        } catch {}
      } catch { /* Existing bridge versions keep manual export. */ }
    },
    save,
    async action(action) {
      if (writing) await writing;
      if (action==='auto-backup-off') {
        await native().disableBackup();
        enabled=false;
        clearTimeout(delay);
        failed=false;
        lastSaved=null;
        remember();
        return;
      }
      if (action==='auto-backup-folder') {
        const result=await native().chooseBackupFolder();
        if (result.cancelled) return;
        enabled=result.enabled;
        lastSaved=null;
      }
      await save();
      if (!failed) notice('Автокопия сохранена');
    },
    panel() {
      if (!initialized) return '';
      return '<section class="panel padded form-stack"><h2>Автокопия дневника</h2>'+
        '<p>Выберите папку вне приложения. Приложение обновляет копию после изменений, включая дневник, рецепты, покупки, список продуктов и черновики. После переустановки выберите свежий файл в «Восстановить из файла».</p>'+
        '<p class="muted">'+(failed?'Последняя запись копии не удалась.':lastSaved?'Последняя копия: '+h(new Date(lastSaved).toLocaleString('ru-RU')):enabled?'Автокопия включена.':'Автокопия выключена.')+'</p>'+
        '<div class="entry-footer">'+(enabled?button('Сохранить сейчас','auto-backup-now',{kind:'primary',symbol:'download'})+
          actionMenu('Действия автокопии',button('Сменить папку','auto-backup-folder')+
            button('Отключить','auto-backup-off',{kind:'danger'}),'entry-menu'):
          button('Выбрать папку','auto-backup-folder',{kind:'primary'}))+'</div></section>';
    }
  };
}
