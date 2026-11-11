import { initialState } from './core.js';

export async function openStorage() {
  const scope = new URL('./', import.meta.url).pathname;
  const db = await new Promise((resolve,reject) => {
    const request = indexedDB.open('moya-kuhnya:'+scope,1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закройте другие вкладки «Моей кухни» и обновите страницу.'));
    request.onsuccess = () => resolve(request.result);
  });
  db.onversionchange = () => db.close();

  function transaction(mode,operate) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction('data',mode);
      let result;
      let error;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('Изменения не сохранены.'));
      const store = tx.objectStore('data');
      const request = store.get('state');
      request.onsuccess = () => {
        try {
          result = operate(request.result ?? initialState());
          if (mode === 'readwrite') store.put(result,'state');
        } catch (failure) {
          error = failure;
          tx.abort();
        }
      };
    });
  }
  return {
    read: () => transaction('readonly',state=>state),
    change: mutate => transaction('readwrite',mutate)
  };
}
