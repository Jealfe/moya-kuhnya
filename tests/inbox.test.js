import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initialState, parseJsonText } from '../public/core.js';
import { addInboxRecipes, readRecipeInbox } from '../public/inbox.js';

const read = path => JSON.parse(readFileSync(new URL('../public/data/'+path,import.meta.url),'utf8'));
const recipeSchema=read('recipe.schema.json');
const {bundle}=read('exchange.schema.json').$defs;
const builtin=read('recipes/pilaf.json');
const fresh={...builtin,id:'test-new-recipe',name:'Новый рецепт'};

function entry(name,text) {
  const bytes = Buffer.from(text);
  const sha = createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  return {name,type:'file',size:bytes.length,sha};
}

test('GitHub импортирует JSON и набор, пропускает посторонние файлы и сообщает об ошибках',async ()=>{
  const texts={
    'a.json':JSON.stringify(fresh),
    'b.json':JSON.stringify({format:'moya-kuhnya-recipes',version:1,recipes:[builtin,{...fresh,id:'second-recipe'}]}),
    'invalid.json':'{"version":1}',
    'README.md':'Описание папки',
    'folder.json':'Каталог'
  };
  const listed=Object.entries(texts).map(([name,text])=>entry(name,text));
  listed.at(-1).type='dir';
  const fetched=[];
  const fetchMock=async (url,options)=>{
    if (url.startsWith('https://api.github.com/')) {
      assert.equal(options.cache,'no-store');
      return Response.json(listed);
    }
    const name=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    fetched.push(name);
    return new Response(texts[name]);
  };
  const result=await readRecipeInbox(recipeSchema,bundle,fetchMock);
  assert.deepEqual(result.recipes.map(recipe=>recipe.id),[fresh.id,builtin.id,'second-recipe']);
  assert.deepEqual(fetched,['a.json','b.json','invalid.json']);
  assert.deepEqual(result.issues.map(issue=>issue.name),['invalid.json']);
  assert.match(result.issues[0].message,/id.*обязательное/);
});

test('неподходящая версия файла не попадает в каталог',async ()=>{
  const listed=entry('race.json',JSON.stringify(fresh));
  const result=await readRecipeInbox(recipeSchema,bundle,async url=>
    url.startsWith('https://api.github.com/') ? Response.json([listed]) : Response.json(builtin));
  assert.deepEqual(result.recipes,[]);
  assert.match(result.issues[0].message,/изменился во время проверки/);
});

test('повторная проверка не дублирует блюда и не перезаписывает локальные правки',()=>{
  const state=initialState();
  const originals=[builtin];
  const originalName='Моя версия';
  state.recipes.push({...fresh,name:originalName});
  const items=[fresh,builtin,{...fresh,id:'one-more'}, {...fresh,id:'one-more'}];
  assert.deepEqual(addInboxRecipes(state,originals,items),{added:1,existing:3,overLimit:0});
  assert.deepEqual(addInboxRecipes(state,originals,items),{added:0,existing:4,overLimit:0});
  assert.equal(state.recipes.find(recipe=>recipe.id===fresh.id).name,originalName);
});

test('вставка JSON принимает обычный ответ и кодовый блок из чата',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  assert.deepEqual(parseJsonText(' '+JSON.stringify(fresh)),fresh);
  assert.deepEqual(parseJsonText(fence+'json\r\n'+JSON.stringify(fresh)+'\r\n'+fence),fresh);
  assert.throws(()=>parseJsonText('ответ без JSON'),/синтаксис/);
});
