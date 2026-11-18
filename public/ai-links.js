export function validateAnalysisLinks(data) {
  const records=data.aiAnalyses??[];
  if (new Set(records.map(record=>record.id)).size!==records.length || new Set(records.map(record=>record.entryId)).size!==records.length) throw Error('В копии повторяются анализы ИИ.');
  const entries=new Map(data.history.map(entry=>[entry.id,entry]));
  for (const record of records) {
    const entry=entries.get(record.entryId);
    if (!entry || entry.recipeId!==record.recipeId || entry.pending) throw Error('Анализ ИИ ссылается на неизвестную готовку.');
    const keys=record.feedback.map(item=>item.issueIndex+'.'+item.recommendationIndex);
    if (new Set(keys).size!==keys.length || record.feedback.some(item=>!record.result.issues[item.issueIndex]?.recommendations[item.recommendationIndex])) throw Error('В копии неверные отметки рекомендаций.');
    if (entry.recipeSnapshot && record.result.issues.some(issue=>issue.stepIndexes.some(index=>index>=entry.recipeSnapshot.steps.length))) throw Error('Анализ ИИ ссылается на неизвестный шаг.');
  }
}
