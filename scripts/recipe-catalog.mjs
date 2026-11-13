
import { readdir, readFile } from 'node:fs/promises';
import { parseRecipes, parseJsonText } from '../public/core.js';

const json = async path => parseJsonText(await readFile(path,'utf8'));

export async function recipeCatalog() {
  const dir='public/data/recipes/';
  const [ids,schema,exchange,files]=await Promise.all([
    json(dir+'index.json'),json('public/data/recipe.schema.json'),json('public/data/exchange.schema.json'),readdir('recipes-inbox')
  ]);
  const groups=await Promise.all([
    ...ids.map(id=>json(dir+id+'.json')),
    ...files.filter(name=>name.endsWith('.json')).sort().map(name=>json('recipes-inbox/'+name))
  ]);
  const catalog=new Map();
  for (const group of groups) {
    for (const recipe of parseRecipes(group,schema,exchange.$defs.bundle)) {
      if (!catalog.has(recipe.id)) catalog.set(recipe.id,recipe);
    }
  }
  const cell = value => value.replace(/[\t\r\n]+/g,' ').trim();
  return 'id\tназвание\tкатегория\n'+[...catalog.values()]
    .sort((a,b)=>a.name.localeCompare(b.name,'ru') || a.id.localeCompare(b.id))
    .map(({id,name,category})=>[id,name,category].map(cell).join('\t')).join('\n')+'\n';
}
