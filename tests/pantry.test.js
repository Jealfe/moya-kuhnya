
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

test('рецепты сгруппированы по нехватке и отсортированы по времени',()=>{
  assert.deepEqual(matchRecipes(recipes,['Картошка','Свекла']).map(({recipe,missing})=>[recipe.name,missing]),[
    ['Быстрее',[]],['Дольше',[]],['С чесноком',['Чеснок']],['Со специями',['Морковь','Зира (кумин), молотая']]
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
