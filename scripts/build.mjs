import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

await rm('dist', {recursive:true,force:true});
await cp('public','dist',{recursive:true});
const files = (await readdir('dist',{recursive:true,withFileTypes:true}))
  .filter(entry=>entry.isFile())
  .map(entry=>join(entry.parentPath,entry.name).slice(5).replaceAll('\\','/'))
  .filter(file=>file!=='sw.js').sort();
const hash = createHash('sha256');
for(const file of [...files,'sw.js']) hash.update(file).update(await readFile(join('dist',file)));
const worker = (await readFile('dist/sw.js','utf8')).replace('__BUILD__',hash.digest('hex').slice(0,16))
  .replace('__FILES__',JSON.stringify(files.map(file=>'./'+file)));
await writeFile('dist/sw.js',worker);
const index = await readFile('dist/index.html','utf8');
await writeFile('dist/index.html',index.replace('<html ','<html data-build="production" '));
await writeFile('dist/.nojekyll','');
console.log('Готово:', files.length, 'ресурсов для офлайн-работы.');
