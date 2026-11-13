
import { isAndroid, nativePlugin } from './native.js';
import { button, h } from './ui.js';

export function createAutoBackup({getState,notice}) {
  let enabled=false, initialized=false, writing=null, pending=null, lastSaved=null, failed=false;
  const native = () => nativePlugin('KitchenDevice');

  function save(state) {
    if (!enabled) return;
    pending=state;
    if (writing) return;
    writing=(async()=>{
      while (pending && enabled) {
        const current=pending;
        pending=null;
        try {
          // Same versioned format as manual export. The native module alternates files.
          const content=JSON.stringify({format:'moya-kuhnya-backup',version:2,created:Date.now(),data:current});
          if (new Blob([content]).size>256*1024*1024) throw Error('Автокопия превышает 256 МБ. Для восстановления приложение принимает файлы до 256 МБ.');
          await native().writeBackup({content});
          lastSaved=Date.now();
          failed=false;
        } catch (error) {
          if (!failed) notice(error.message);
          failed=true;
        }
      }
    })().finally(()=>{writing=null;});
  }

  return {
    async initialize() {
      if (!isAndroid()) return;
      try {
        enabled=(await native().backupStatus()).enabled;
        initialized=true;
      } catch { /* Existing bridge versions keep manual export. */ }
    },
    save,
    async action(action) {
      if (writing) await writing;
      if (action==='auto-backup-off') {
        await native().disableBackup();
        enabled=false;
        failed=false;
        return;
      }
      if (action==='auto-backup-folder') {
        const result=await native().chooseBackupFolder();
        if (result.cancelled) return;
        enabled=result.enabled;
      }
      save(getState());
      await writing;
      if (!failed) notice('Автокопия сохранена');
    },
    panel() {
      if (!initialized) return '';
      return '<section class="panel padded form-stack"><h2>Автокопия дневника</h2>'+
        '<p>Выберите папку вне приложения. После изменения дневника приложение сохранит копию вместе с фото и рекомендациями ИИ. После переустановки выберите свежий файл в «Восстановить из файла».</p>'+
        '<p class="muted">'+(failed?'Последняя запись копии не удалась.':lastSaved?'Последняя копия: '+h(new Date(lastSaved).toLocaleString('ru-RU')):enabled?'Автокопия включена.':'Автокопия выключена.')+'</p>'+
        '<div class="actions">'+button(enabled?'Сменить папку':'Выбрать папку','auto-backup-folder',{kind:'primary'})+
        (enabled?button('Сохранить сейчас','auto-backup-now')+button('Отключить','auto-backup-off',{kind:'quiet'}):'')+'</div></section>';
    }
  };
}
