import { parseBackup } from './core.js';

const imageTypes=['image/jpeg','image/png','image/webp'];
const readDataUrl=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error);
  reader.readAsDataURL(file);
});

export async function makeBackup({state,pantry,drafts}) {
  const encoded=await Promise.all(drafts.map(async ({id,value})=>{
    const file=id.startsWith('editor-photo/')?value:value?.image;
    if (!(file instanceof Blob)) return {id,value};
    const photo={name:file.name,type:file.type,data:await readDataUrl(file)};
    return {id,value:id.startsWith('editor-photo/')?photo:{...value,image:photo}};
  }));
  return {format:'moya-kuhnya-backup',version:3,created:Date.now(),data:state,pantry,drafts:encoded};
}

function decodePhoto(photo) {
  if (!photo || !imageTypes.includes(photo.type) || typeof photo.name!=='string' || typeof photo.data!=='string') throw Error('Некорректное фото черновика.');
  const prefix='data:'+photo.type+';base64,';
  if (!photo.data.startsWith(prefix) || photo.data.length>49_000_000) throw Error('Некорректное фото черновика.');
  const bytes=Uint8Array.from(atob(photo.data.slice(prefix.length)),char=>char.charCodeAt(0));
  return new File([bytes],photo.name,{type:photo.type});
}

export function readBackup(copy,exchange) {
  if (copy?.version!==3) return {state:parseBackup(copy,exchange.backup,exchange.legacyBackup)};
  const {format,created,data,pantry,drafts}=copy;
  const state=parseBackup({format,version:2,created,data},exchange.backup,exchange.legacyBackup);
  if (!pantry || typeof pantry.useBasics!=='boolean' || !Array.isArray(pantry.products) || pantry.products.length>200 ||
      pantry.products.some(name=>typeof name!=='string' || !name.trim() || name.length>120)) throw Error('Некорректный список продуктов в копии.');
  if (!Array.isArray(drafts)) throw Error('Некорректные черновики в копии.');
  const ids=new Set();
  const decoded=drafts.map(({id,value})=>{
    if (typeof id!=='string' || !/^(editor(-photo)?\/[a-z0-9_-]*|report\/[a-z0-9_-]+)$/i.test(id) ||
        !value || typeof value!=='object' || Array.isArray(value) || ids.has(id)) throw Error('Некорректный черновик в копии.');
    ids.add(id);
    if (id.startsWith('editor-photo/')) return {id,value:decodePhoto(value)};
    if (id.startsWith('report/')) {
      const fields=['minutes','again','rating','good','errors','next'];
      if (fields.some(key=>value[key]!=null && typeof value[key]!=='string')) throw Error('Некорректный черновик отзыва.');
      return {id,value:{...value,image:value.image?decodePhoto(value.image):undefined}};
    }
    for (const key of ['ingredients','steps','tools','tips','mistakes']) {
      if (!Array.isArray(value[key])) throw Error('Некорректный черновик рецепта.');
    }
    if (value.steps.some(step=>!step || !Array.isArray(step.ingredients) || !Array.isArray(step.timers) ||
        step.timers.some(timer=>!timer)) || value.ingredients.some(item=>!item)) throw Error('Некорректный черновик рецепта.');
    return {id,value};
  });
  return {state,pantry,drafts:decoded};
}
