
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
