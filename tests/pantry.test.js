
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRecipes, productCatalog, splitProducts, suggestProducts, updateProducts } from '../public/pantry.js';

const recipe = (name,ingredients,minutes=10) => ({name,prep:0,cook:minutes,ingredients:ingredients.map(name=>({name}))});
const recipes = [
  recipe('Дольше',['Картофель','Свёкла'],30),
  recipe('Быстрее',['Картофель','Свёкла','Картофель'],10),
  recipe('С чесноком',['Картофель','Свёкла','Чеснок']),
  recipe('Со специями',['Картофель','Свёкла','Морковь','Зира (кумин), молотая']),
  recipe('Без совпадений',['Филе лосося','Соль']),
  recipe('Не хватает трёх',['Картофель','Соль','Сахар','Морковь'])
];
const catalog=productCatalog(recipes);

test('список принимает несколько строк и сохраняет составные названия',()=>{
  const entered=splitProducts(' картошка, СВЕКЛА\nКАРТОФЕЛЬ; Зира (кумин), молотая, яблоко ',catalog);
  assert.deepEqual(updateProducts([],entered,catalog),['Картофель','Свёкла','Зира (кумин), молотая','яблоко']);
  assert.deepEqual(suggestProducts('картош',catalog,[]),['Картофель']);
  assert.deepEqual(suggestProducts('картош',catalog,['Картофель']),[]);
  assert.throws(()=>updateProducts([],['а'.repeat(121)],catalog),/120/);
});

test('рецепты ранжируются по совпадениям без ограничения числа недостающих продуктов',()=>{
  assert.deepEqual(matchRecipes(recipes,['Картошка','Свекла'],{useBasics:false}).map(({recipe,missing})=>[recipe.name,missing]),[
    ['Быстрее',[]],['Дольше',[]],['С чесноком',['Чеснок']],['Со специями',['Морковь','Зира (кумин), молотая']],['Не хватает трёх',['Соль','Сахар','Морковь']]
  ]);
  assert.deepEqual(matchRecipes(recipes,[]),[]);
  assert.deepEqual(matchRecipes(recipes,['яблоко']),[]);
});

test('замена растительного масла направленная, рис и части курицы различаются',()=>{
  const dishes=[
    recipe('Рис',['Рис варёный','Соль']),
    recipe('Грудка',['Куриное филе','Растительное масло']),
    recipe('Бёдра',['Куриные бёдра','Подсолнечное рафинированное масло'])
  ];
  const products=['Рис длиннозёрный','Соль','Куриная грудка','Рафинированное подсолнечное масло'];
  assert.deepEqual(matchRecipes(dishes,products).map(({recipe,missing})=>[recipe.name,missing]),[
    ['Грудка',[]],['Бёдра',['Куриные бёдра']],['Рис',['Рис варёный']]
  ]);
  assert.deepEqual(matchRecipes(dishes,['Куриные бёдра','Растительное масло']).find(({recipe})=>recipe.name==='Бёдра').missing,
    ['Подсолнечное рафинированное масло']);
});

test('картофель, курица и рис поднимают общие совпадения и сохраняют отдельные блюда',()=>{
  const dishes=[
    recipe('Пюре',['Картофель','Молоко']),
    recipe('Курица с картофелем',['Куриные бёдра','Картофель','Чеснок']),
    recipe('Рис с курицей и картофелем',['Картофель','Куриное филе','Рис варёный','Морковь','Сахар','Чеснок','Лайм']),
    recipe('Салат',['Помидоры','Соль'])
  ];
  assert.equal(matchRecipes(dishes,['картофель','курица'])[0].recipe.name,'Курица с картофелем');
  const matches=matchRecipes(dishes,['картофель','курица','рис']);
  assert.equal(matches.length,3);
  assert.deepEqual(matches[0].check,['Куриное филе','Рис варёный']);
  assert.deepEqual(matches[0].missing,['Морковь','Сахар','Чеснок','Лайм']);
  assert.equal(matches[0].matchedProducts,3);
  assert.deepEqual(matchRecipes(dishes,['картофель','курица','рис','рис длиннозёрный']).find(({recipe})=>recipe.name==='Рис с курицей и картофелем').missing.includes('Рис варёный'),true);
});

test('основы доступны по умолчанию и не создают совпадений сами по себе',()=>{
  const dishes=[
    recipe('Картофель',['Картофель','Соль','Вода','Растительное масло']),
    recipe('Жареная рыба',['Рыба','Растительное масло']),
    recipe('Пюре',['Картофель','Сливочное масло','Оливковое масло'])
  ];
  assert.deepEqual(matchRecipes(dishes,[]),[]);
  const matches=matchRecipes(dishes,['картошка']);
  assert.equal(matches.length,2);
  assert.deepEqual(matches[0].available,['Картофель','Соль','Вода','Растительное масло']);
  assert.deepEqual(matches[1].missing,['Сливочное масло','Оливковое масло']);
  assert.deepEqual(matchRecipes(dishes,['картошка'],{useBasics:false})[1].missing,['Соль','Вода','Растительное масло']);
});

test('общие названия из ручного ввода находят разновидности продуктов без ложных совпадений',()=>{
  const dishes=[
    recipe('Тесто',['Мука пшеничная']),
    recipe('Блины',['Рисовая мука']),
    recipe('Макароны с сыром',['Макароны перья']),
    recipe('Томатный соус',['Томатная паста']),
    recipe('Пюре',['Картофель молодой'])
  ];
  const names=productCatalog(dishes);
  const entered=updateProducts([],splitProducts('мука, макароны, картошка',names),names);
  assert.deepEqual(entered,['Мука','Макароны','Картофель молодой']);
  const result=new Map(matchRecipes(dishes,entered).map(match=>[match.recipe.name,match]));
  assert.deepEqual(result.get('Тесто').check,['Мука пшеничная']);
  assert.deepEqual(result.get('Блины').check,['Рисовая мука']);
  assert.deepEqual(result.get('Макароны с сыром').check,['Макароны перья']);
  assert.deepEqual(result.get('Пюре').available,['Картофель молодой']);
  assert.equal(result.has('Томатный соус'),false);
  assert.deepEqual(matchRecipes(dishes,['рисовая мука']).map(match=>match.recipe.name),['Блины']);
});

test('общие названия находят разновидности из новых рецептов по целым словам',()=>{
  const dishes=[
    recipe('Салат',['Полутвёрдый сыр','Яблочный уксус 5%','Лук красный']),
    recipe('Запеканка',['Цветная капуста','Ржаная мука цельнозерновая']),
    recipe('Рыба',['Сырой лосось','Чернослив']),
    recipe('Соус',['Крем-сыр','Бальзамический уксус']),
    recipe('Спагетти',['Спагетти цельнозерновые'])
  ];
  const names=productCatalog(dishes);
  const entered=updateProducts([],splitProducts('сыр, уксус, капуста, лук, ржаная мука',names),names);
  const result=matchRecipes(dishes,entered);
  assert.deepEqual(result.map(({recipe,check})=>[recipe.name,check]),[
    ['Салат',['Полутвёрдый сыр','Яблочный уксус 5%','Лук красный']],
    ['Запеканка',['Цветная капуста','Ржаная мука цельнозерновая']],
    ['Соус',['Крем-сыр','Бальзамический уксус']]
  ]);
  assert.deepEqual(matchRecipes(dishes,['сыр','полутвёрдый сыр']).map(({recipe})=>recipe.name),['Салат']);
  assert.deepEqual(matchRecipes(dishes,['макароны'])[0].check,['Спагетти цельнозерновые']);
});
