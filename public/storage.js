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

  function transaction(mode,operate,key='state',initialize=initialState) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction('data',mode);
      let result;
      let error;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('Изменения не сохранены.'));
      const store = tx.objectStore('data');
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          result = operate(key==='state'?{...initialize(),...request.result}:request.result??initialize());
          if (mode === 'readwrite') store.put(result,key);
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
  const pantryState = saved => Array.isArray(saved)?{products:saved,useBasics:true}:saved;
  const emptyPantry = () => ({products:[],useBasics:true});
  const draftRange=()=>IDBKeyRange.bound('draft/','draft0',false,true);
  function snapshot(mode,operate) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('data',mode);
      const store=tx.objectStore('data');
      const result=operate(store);
      tx.oncomplete=()=>resolve(result());
      tx.onabort=()=>reject(tx.error ?? Error('Не удалось обработать резервную копию.'));
    });
  }
  return {
    readBackup: () => snapshot('readonly',store=>{
      const state=store.get('state'), pantry=store.get('pantry'), drafts=store.getAll(draftRange());
      return ()=>({state:{...initialState(),...state.result},pantry:pantryState(pantry.result??emptyPantry()),drafts:drafts.result});
    }),
    restoreBackup: ({state,pantry,drafts}) => snapshot('readwrite',store=>{
      store.put(state,'state');
      if (pantry) store.put(pantry,'pantry');
      if (drafts) {
        store.delete(draftRange());
        for (const draft of drafts) store.put(draft,'draft/'+draft.id);
      }
      return ()=>state;
    }),
    read: () => transaction('readonly',state=>state),
    change: mutate => transaction('readwrite',mutate),
    readPantry: () => transaction('readonly',pantryState,'pantry',emptyPantry),
    changePantry: mutate => transaction('readwrite',saved=>mutate(pantryState(saved)),'pantry',emptyPantry),
    readDrafts: async () => Object.fromEntries((await draftRequest('readonly',store=>
      store.getAll(IDBKeyRange.bound('draft/','draft0',false,true)))).map(({id,value})=>[id,value])),
    saveDraft: (id,value) => draftRequest('readwrite',store=>value===null
      ? store.delete('draft/'+id)
      : store.put({id,value},'draft/'+id))
  };
}
