import { isAndroid, nativePlugin } from './native.js';
import { adviceForStep, analysisStale, createAnalysis, currentAdvice, latestAnalysis, recipeForEntry, reviewData, fingerprint, storeAnalysis } from './ai.js';
import { button, dateLabel, field, h, input, list, select } from './ui.js';

export function createAi({getState,findRecipe,change,render,showDialog,showError}) {
  let status={hasKey:false,model:'GigaChat-2',scope:'GIGACHAT_API_PERS'},connectionStatus='Подключение ещё не проверено.',models=[];
  let busyEntry=null,settingsBusy=false,requestCancelled=false,schema;
  const advice=new Map();
  const native=()=>nativePlugin('GigaChat');
  async function refreshAdvice() {
    advice.clear();
    for (const id of new Set((getState().aiAnalyses??[]).map(record=>record.recipeId))) {
      const record=await currentAdvice(getState(),findRecipe(id));
      if (record) advice.set(id,record);
    }
  }
  async function initialize(resultSchema) {
    schema=resultSchema;
    if (isAndroid()) {
      try {status=await native().status();} catch(error) {connectionStatus=error.message;}
    }
    await refreshAdvice();
  }
  function settings() {
    if (!isAndroid()) return '<section class="panel padded"><h2>Искусственный интеллект</h2><p>GigaChat доступен в Android-приложении. Сохранённые анализы можно читать и переносить в JSON-копии.</p></section>';
    const disabled=settingsBusy||busyEntry?'disabled':'';
    return '<section class="panel padded form-stack"><h2>Искусственный интеллект</h2><p>GigaChat анализирует рецепт и ваши текстовые отзывы только по нажатию кнопки. Фотографии не отправляются.</p>'+
      '<form id="ai-settings" class="form-stack">'+field('Ключ авторизации GigaChat',input('gigachat-key','','type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="8192" '+disabled))+
      '<small>'+h(status.hasKey?'Ключ сохранён на устройстве. Оставьте поле пустым, чтобы сохранить только модель и тип доступа.':'Введите ключ авторизации из личного кабинета GigaChat.')+'</small>'+
      field('Модель',input('ai-model',status.model,'list="ai-models" required maxlength="100" '+disabled))+
      '<datalist id="ai-models">'+models.map(model=>'<option value="'+h(model)+'">').join('')+'</datalist>'+
      field('Тип доступа',select('ai-scope',[['GIGACHAT_API_PERS','Личный'],['GIGACHAT_API_B2B','Бизнес (B2B)'],['GIGACHAT_API_CORP','Корпоративный']],status.scope,disabled))+
      '<button class="btn primary" '+disabled+'>Сохранить ключ</button></form>'+
      '<div class="actions">'+button('Проверить подключение','ai-connect',{disabled:Boolean(disabled)||!status.hasKey})+
      button('Удалить ключ','ai-delete-key',{disabled:Boolean(disabled)||!status.hasKey,kind:'quiet danger'})+'</div>'+
      '<p role="status">'+h(settingsBusy?'Выполняется…':connectionStatus)+'</p><small>Ключ защищён Android Keystore и не включается в JSON-копии. После удаления приложения введите его заново. На устройстве с root-доступом абсолютная защита секретов невозможна.</small></section>';
  }
  function entryControls(entry) {
    if (entry.pending) return '';
    const record=latestAnalysis(getState(),entry.id);
    const controls=record?button('Рекомендации ИИ','ai-view',{id:entry.id}):'';
    if (!isAndroid()) return controls;
    if (busyEntry===entry.id) return controls+'<p role="status">GigaChat разбирает отзыв…</p>'+button('Отменить запрос','ai-cancel');
    return controls+button(record?'Повторить анализ':'Разобрать ошибки с ИИ',record?'ai-repeat':'ai-analyze',{id:entry.id,disabled:busyEntry!==null||settingsBusy});
  }
  function feedbackButtons(record,i,j) {
    const feedback=record.feedback.find(item=>item.issueIndex===i && item.recommendationIndex===j);
    const id=record.id+':'+i+':'+j;
    return '<div class="actions">'+button(feedback?.done?'Выполнено ✓':'Отметить выполненным','ai-done',{id,kind:feedback?.done?'active':'quiet'})+
      button(feedback?.useful?'Полезно ✓':'Полезно','ai-useful',{id,kind:feedback?.useful?'active':'quiet'})+'</div>';
  }
  async function showResult(entryId) {
    const state=getState(),entry=state.history.find(item=>item.id===entryId),record=latestAnalysis(state,entryId);
    if (!record||!entry) throw Error('Анализ больше не доступен.');
    const recipe=findRecipe(entry.recipeId);
    const stale=await analysisStale(record,entry,recipe);
    const result=record.result;
    showDialog('Разбор приготовления',
      '<p class="muted">'+h(entry.name)+' · '+h(dateLabel(record.at))+'</p>'+
      (stale?'<p class="info">Отзыв или рецепт изменён. Рекомендации могут быть устаревшими; выполните новый анализ.</p>':'')+
      '<p>'+h(result.summary)+'</p>'+result.issues.map((issue,i)=>'<section class="ai-issue"><h3>'+h(issue.title)+'</h3>'+
        (issue.possibleCauses.length?'<h4>Возможные причины</h4>'+list(issue.possibleCauses):'')+
        '<h4>Рекомендации</h4><ul>'+issue.recommendations.map((text,j)=>'<li>'+h(text)+feedbackButtons(record,i,j)+'</li>').join('')+'</ul>'+
        (issue.stepIndexes.length?'<p class="muted">Шаги: '+issue.stepIndexes.map(index=>index+1).join(', ')+'</p>':'')+'</section>').join('')+
      (result.nextTimeChecklist.length?'<h3>План следующей готовки</h3>'+list(result.nextTimeChecklist):'')+
      (result.questions.length?'<h3>Что уточнить</h3>'+list(result.questions)+'<p class="muted">Уточнения можно сохранить в заметках следующей попытки — они будут учтены при новом анализе.</p>':'')+
      (isAndroid()?button('Повторить анализ','ai-repeat',{id:entryId,disabled:busyEntry!==null||settingsBusy}):''));
  }
  function beforeCooking(recipeId) {
    const record=advice.get(recipeId);
    if (!record) return '';
    const pending=record.result.issues.flatMap((issue,i)=>issue.recommendations.map((text,j)=>({text,done:record.feedback.find(f=>f.issueIndex===i&&f.recommendationIndex===j)?.done}))).filter(item=>!item.done);
    // Use the last analysis only, and hide a completed plan.
    const checklist=pending.length || !record.result.issues.length?record.result.nextTimeChecklist:[];
    return checklist.length?'<section class="panel padded ai-advice"><h2>На что обратить внимание в этот раз</h2>'+list(checklist.slice(0,6))+'</section>':'';
  }
  function stepAdvice(recipeId,index) {
    const record=advice.get(recipeId),items=adviceForStep(record,index);
    return items.length?'<div class="note ai-advice"><h3>Советы из прошлой попытки</h3>'+items.map(item=>'<p>'+h(item.text)+'</p>'+feedbackButtons(record,item.issueIndex,item.recommendationIndex)).join('')+'</div>':'';
  }
  async function analyze(entryId,repeat=false) {
    if (busyEntry!==null||settingsBusy) return;
    const state=getState(),entry=state.history.find(item=>item.id===entryId && !item.pending);
    if (!entry) throw Error('Сначала сохраните отзыв.');
    if (!repeat && latestAnalysis(state,entryId)) {await showResult(entryId);return;}
    if (!isAndroid()) throw Error('Анализ доступен в Android-приложении.');
    if (!status.hasKey) {location.hash='/settings';throw Error('Сохраните ключ GigaChat в настройках.');}
    const recipe=recipeForEntry(entry,findRecipe(entry.recipeId));
    if (!recipe) throw Error('Рецепт больше не доступен.');
    document.querySelector('#dialog')?.close();
    requestCancelled=false;busyEntry=entryId;render();
    try {
      const record=await createAnalysis({recipe,entry,state,schema,request:payload=>{if(requestCancelled)throw Error('Запрос отменён.');return native().analyze(payload);}});
      if(requestCancelled)throw Error('Запрос отменён.');
      const current=getState().history.find(item=>item.id===entryId);
      if (!current || await fingerprint(reviewData(current))!==record.reviewHash) throw Error('Отзыв изменился. Выполните новый анализ.');
      await change(currentState=>storeAnalysis(currentState,record));
      await showResult(entryId);
    } finally {busyEntry=null;render();}
  }
  async function save(form) {
    if (settingsBusy||busyEntry) return;
    const field=form.elements['gigachat-key'];
    let key=field.value.trim();field.value='';
    const options={model:form.elements['ai-model'].value.trim(),scope:form.elements['ai-scope'].value};
    settingsBusy=true;render();
    try {
      status=await (key?native().saveKey({...options,key}):native().configure(options));
      connectionStatus=status.hasKey?'Настройки сохранены. Нажмите «Проверить подключение».':'Настройки сохранены. Введите ключ.';
    } finally {key='';settingsBusy=false;render();}
  }
  async function action(action,id) {
    switch(action) {
      case 'ai-view': return showResult(id);
      case 'ai-analyze': return analyze(id);
      case 'ai-repeat': return analyze(id,true);
      case 'ai-cancel': requestCancelled=true;return native().cancel();
      case 'ai-connect':
      case 'ai-delete-key': {
        if(settingsBusy||busyEntry)return;
        settingsBusy=true;render();
        try {
          if(action==='ai-connect') {
            const response=await native().checkConnection();status=response;models=response.models??[];
            connectionStatus='Подключение работает. '+(models.includes(status.model)?'Модель доступна.':'Выберите модель из полученного списка.');
          } else {status=await native().deleteKey();models=[];connectionStatus='Ключ удалён с устройства.';}
        } catch(error) {connectionStatus=error.message;throw error;}
        finally {settingsBusy=false;render();}
        return;
      }
      case 'ai-done':
      case 'ai-useful': {
        const [recordId,i,j]=id.split(':');let entryId;
        await change(state=>{
          const record=state.aiAnalyses?.find(item=>item.id===recordId);
          if(!record?.result.issues[+i]?.recommendations[+j])throw Error('Рекомендация уже изменилась.');
          entryId=record.entryId;
          let feedback=record.feedback.find(item=>item.issueIndex===+i&&item.recommendationIndex===+j);
          if(!feedback){feedback={issueIndex:+i,recommendationIndex:+j,done:false,useful:false};record.feedback.push(feedback);}
          const key=action==='ai-done'?'done':'useful';feedback[key]=!feedback[key];
        });
        render();
        if(document.querySelector('#dialog')?.open)await showResult(entryId);
        return;
      }
    }
  }
  return {initialize,refreshAdvice,settings,entryControls,beforeCooking,stepAdvice,action,save:form=>save(form).catch(showError)};
}
