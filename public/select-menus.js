import { isAndroid } from './native.js';
import { icon } from './ui.js';

export function installSelectMenus() {
  if (!isAndroid()) return;
  const popup=document.createElement('dialog');
  popup.className='select-popup';
  popup.setAttribute('aria-labelledby','select-popup-title');
  document.body.append(popup);

  function enhance(select) {
    if (select.parentElement?.classList.contains('select-wrap')) return;
    const wrap=document.createElement('span');
    wrap.className='select-wrap';
    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='select-trigger';
    trigger.setAttribute('aria-haspopup','dialog');
    const value=document.createElement('span');
    trigger.append(value);
    trigger.insertAdjacentHTML('beforeend',icon('arrow'));
    select.before(wrap);
    wrap.append(select,trigger);
    select.hidden=true;
    const label=select.getAttribute('aria-label') || select.labels[0]?.querySelector('span')?.textContent || 'Выберите вариант';
    const sync=()=>{
      value.textContent=select.selectedOptions[0]?.textContent??'';
      trigger.setAttribute('aria-label',label+': '+value.textContent);
      trigger.disabled=select.disabled;
    };
    sync();
    select.addEventListener('change',sync);

    trigger.addEventListener('click',()=>{
      const header=document.createElement('div');
      header.className='dialog-heading';
      const title=document.createElement('h2');
      title.id='select-popup-title';
      title.textContent=label;
      const close=document.createElement('button');
      close.type='button';
      close.className='btn quiet';
      close.textContent='Закрыть';
      close.onclick=()=>popup.close();
      header.append(title,close);
      const list=document.createElement('div');
      list.className='select-choices';
      for (const option of select.options) {
        const item=document.createElement('button');
        item.type='button';
        item.textContent=option.textContent;
        item.disabled=option.disabled;
        item.setAttribute('aria-pressed',String(option.selected));
        item.onclick=()=>{
          popup.close();
          if (select.selectedIndex===option.index) return;
          select.selectedIndex=option.index;
          select.dispatchEvent(new Event('input',{bubbles:true}));
          select.dispatchEvent(new Event('change',{bubbles:true}));
        };
        list.append(item);
      }
      popup.replaceChildren(header,list);
      popup.showModal();
      list.querySelector('[aria-pressed="true"]:not(:disabled)')?.focus();
    });
  }
  new MutationObserver(records=>{
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches('select')) enhance(node);
      else node.querySelectorAll('select').forEach(enhance);
    }
  }).observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('select').forEach(enhance);
  window.addEventListener('hashchange',()=>{if (popup.open) popup.close();});
}
