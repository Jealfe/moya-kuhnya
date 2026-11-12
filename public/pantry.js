
import { totalTime } from './core.js';

export const quickProducts = ['Вода','Соль','Растительное масло'];
export const maxProducts = 200;
export const maxProductLength = 120;

const normalize = name => name.normalize('NFKC').toLocaleLowerCase('ru')
  .replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const variants = [
  ['Яйцо','Яйца','Куриное яйцо','Куриные яйца'],
  ['Картофель','Картошка','Некрупный картофель'],
  ['Репчатый лук','Лук репчатый','Луковица','Лук'],
  ['Красный лук','Лук красный'],
  ['Зелёный лук','Лук зелёный'],
  ['Белокочанная капуста','Капуста белокочанная','Капуста белая'],
  ['Огурец','Огурцы','Свежий огурец','Свежие огурцы'],
  ['Солёные огурцы','Огурцы солёные','Солёный огурец'],
  ['Маринованные огурцы','Огурцы маринованные','Маринованный огурец'],
  ['Помидоры','Помидор','Томат','Томаты','Свежие томаты'],
  ['Помидоры черри','Томаты черри','Черри'],
  ['Сладкий перец','Болгарский перец','Перец сладкий','Перец болгарский'],
  ['Сельдерей стеблевой','Стебель сельдерея','Стебли сельдерея'],
  ['Свёкла','Бурак'],
  ['Кабачок','Кабачки'],
  ['Баклажан','Баклажаны'],
  ['Яблоко','Яблоки'],
  ['Курица','Куриное мясо'],
  ['Куриное филе','Куриная грудка','Филе куриной грудки'],
  ['Куриные бёдра','Куриное бедро','Бёдра куриные'],
  ['Филе куриного бедра','Куриное бедро без кости','Филе куриных бёдер'],
  ['Говяжий фарш','Фарш говяжий'],
  ['Куриный фарш','Фарш куриный'],
  ['Рис варёный','Варёный рис','Отварной рис'],
  ['Рис длиннозёрный','Длиннозёрный рис'],
  ['Рис круглозёрный','Круглозёрный рис'],
  ['Гречка','Гречневая крупа'],
  ['Манная крупа','Манка'],
  ['Перловая крупа','Перловка'],
  ['Пшеничная мука','Мука пшеничная'],
  ['Лавровый лист','Лаврушка'],
  ['Душица сушёная (орегано)','Сушёное орегано','Орегано сушёное','Сушёная душица'],
  ['Зира (кумин)','Зира','Кумин'],
  ['Зира (кумин), молотая','Молотая зира','Молотый кумин'],
  ['Соль','Поваренная соль'],
  ['Сливочное масло','Масло сливочное'],
  ['Растительное масло','Масло растительное'],
  ['Подсолнечное рафинированное масло','Рафинированное подсолнечное масло'],
  ['Оливковое масло','Масло оливковое'],
  ['Лимонный сок','Сок лимона'],
  ['Фасоль варёная','Варёная фасоль','Отварная фасоль']
];
const aliases = new Map(variants.flatMap(group=>group.map(name=>[normalize(name),normalize(group[0])])));
const alternateNames = new Map(variants.map(group=>[normalize(group[0]),group.map(normalize)]));
const substitutions = new Map([
  ['растительное масло',['подсолнечное рафинированное масло']]
]);
export const productKey = name => {
  const key=normalize(name);
  return aliases.get(key)??key;
};

const productFamilies = new Map([
  ['курица',['куриное филе','куриные бедра','филе куриного бедра','куриный фарш','куриные голени','куриные крылья','целая курица']],
  ['рис',['рис длиннозерный','рис круглозерный','рис басмати','рис жасмин','рис арборио','бурый рис','рис вареный']]
]);
const defaultProducts = new Set(quickProducts.map(productKey));
const basicProducts = new Set([...defaultProducts,'подсолнечное рафинированное масло']);

export function productCatalog(recipes) {
  const names = new Map();
  for (const name of [...quickProducts,'Курица','Рис',...recipes.flatMap(recipe=>recipe.ingredients.map(item=>item.name))]) {
    const key = productKey(name);
    if (!names.has(key)) names.set(key,name);
    if (normalize(name)===key) names.set(key,name);
  }
  return names;
}

export function splitProducts(text,catalog) {
  const known = name => aliases.has(normalize(name)) || catalog.has(productKey(name));
  return text.split(/[\r\n;]+/).flatMap(line=>{
    const parts=line.split(',').map(part=>part.trim());
    const names=[];
    while (parts.length) {
      const pair=parts.slice(0,2).join(', ');
      names.push(parts.length>1 && known(pair)?parts.splice(0,2).join(', '):parts.shift());
    }
    return names;
  }).map(name=>name.replace(/\s+/g,' ').trim()).filter(Boolean);
}

export function suggestProducts(query,catalog,products) {
  const search=normalize(query);
  if (!search) return [];
  const selected=new Set(products.map(productKey));
  return [...catalog].flatMap(([key,name])=>{
    if (selected.has(key)) return [];
    const terms=[normalize(name),...(alternateNames.get(key)??[])];
    if (terms.includes(search)) return [{name,rank:0}];
    if (terms.some(term=>term.startsWith(search))) return [{name,rank:1}];
    return terms.some(term=>term.includes(search))?[{name,rank:2}]:[];
  }).sort((a,b)=>a.rank-b.rank || a.name.localeCompare(b.name,'ru')).slice(0,6).map(item=>item.name);
}

export function updateProducts(products,candidates,catalog) {
  const list=new Map(products.map(name=>[productKey(name),name]));
  for (const name of candidates) {
    if (name.length>maxProductLength) throw Error('Название продукта должно быть не длиннее 120 символов.');
    const key=productKey(name);
    if (!list.has(key)) list.set(key,catalog.get(key)??name);
  }
  if (list.size>maxProducts) throw Error('Можно сохранить до 200 продуктов. Удалите лишние из списка.');
  return [...list.values()];
}

export function matchRecipes(recipes,products,{useBasics=true}={}) {
  const selected=new Set(products.map(productKey));
  if (!selected.size) return [];
  const broadMatches=new Map();
  for (const [family,variants] of productFamilies) {
    const specific=variants.find(key=>selected.has(key));
    if (!specific && selected.has(family)) for (const key of variants) broadMatches.set(key,family);
    if (specific) broadMatches.set(family,specific);
  }
  return recipes.flatMap(recipe=>{
    const requirements=new Map(recipe.ingredients.map(item=>[productKey(item.name),item.name]));
    const used=new Set(), main=new Set();
    const available=[],check=[],missing=[];
    for (const [key,name] of requirements) {
      const exact=selected.has(key)?key:substitutions.get(key)?.find(option=>selected.has(option));
      const assumed=useBasics && defaultProducts.has(key);
      const broad=broadMatches.get(key);
      const matched=exact??broad;
      if (matched) {
        used.add(matched);
        if (!basicProducts.has(key)) main.add(matched);
      }
      if (exact || assumed) available.push(name);
      else if (broad) check.push(name);
      else missing.push(name);
    }
    if (!used.size) return [];
    return [{recipe,available,check,missing,matchedProducts:used.size,mainMatches:main.size,minutes:totalTime(recipe)}];
  }).sort((a,b)=>b.mainMatches-a.mainMatches || b.matchedProducts-a.matchedProducts ||
    a.missing.length+a.check.length-b.missing.length-b.check.length ||
    a.check.length-b.check.length || a.minutes-b.minutes || a.recipe.name.localeCompare(b.recipe.name,'ru'));
}
