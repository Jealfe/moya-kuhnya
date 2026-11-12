import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
await mkdir('work/browser',{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs','dist'],{env:{...process.env,KITCHEN_PORT:'4174'},stdio:'pipe'});
let serverError='';server.stderr.on('data',chunk=>serverError+=chunk);
try {
  let ready=false;
  for(let i=0;i<50;i++) {
    if(server.exitCode!==null)throw Error(serverError||'Не удалось запустить сервер проверки.');
    try {ready=(await fetch('http://127.0.0.1:4174/')).ok;}catch{}
    if(ready)break;
    await setTimeout(100);
  }
  if(!ready)throw Error('Сервер не запустился вовремя.');
  for(const file of ['web-browser.mjs','files-browser.mjs','ai-browser.mjs']) {
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['scripts/checks/'+file],{stdio:'inherit',env:process.env});
      child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(file+': '+code)));
    });
  }
} finally {server.kill();}
