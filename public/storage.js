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
          result = operate({...initialState(), ...request.result});
          if (mode === 'readwrite') store.put(result,'state');
        } catch (failure) {
          error = failure;
          tx.abort();
        }
      };
    });
  }
  function draftRequest(mode,operate) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('data',mode);
      const request=operate(tx.objectStore('data'));
      tx.oncomplete=()=>resolve(request.result);
      tx.onabort=()=>reject(tx.error ?? new Error('Черновик не сохранён.'));
    });
  }
  return {
    read: () => transaction('readonly',state=>state),
    change: mutate => transaction('readwrite',mutate),
    readDrafts: async () => Object.fromEntries((await draftRequest('readonly',store=>
      store.getAll(IDBKeyRange.bound('draft/','draft0',false,true)))).map(({id,value})=>[id,value])),
    saveDraft: (id,value) => draftRequest('readwrite',store=>value===null
      ? store.delete('draft/'+id)
      : store.put({id,value},'draft/'+id))
  };
}
