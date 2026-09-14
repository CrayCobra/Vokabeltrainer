// Zielarten des Testmodus: reine Funktionen ohne DOM-Zugriff. Ein Ziel ist ein Fortschritts-
// anzeiger, kein harter Abbruch – die Sitzung endet erst, wenn die Person selbst auswertet
// (siehe views.js), nicht automatisch beim Erreichen des Ziels ("nicht als Countdown-Druck").

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = String(s % 60).padStart(2, '0');
  return `${m}:${rest}`;
}

export function isGoalReached(goal, { correctCount, wrongCount, elapsedMs }) {
  const total = correctCount + wrongCount;
  if (goal.type === 'count') return total >= goal.value;
  if (goal.type === 'duration') return elapsedMs >= goal.value * 1000;
  if (goal.type === 'accuracy') {
    if (total < goal.minCards) return false;
    const rate = total === 0 ? 0 : correctCount / total;
    return rate >= goal.value / 100;
  }
  throw new Error(`Unbekannte Zielart: ${goal.type}`);
}

// Liefert Übersetzungsschlüssel + Parameter statt fertigen Texts (siehe CLAUDE.md: eigenes
// Modul für Übersetzungen); views.js übersetzt mit ctx.t(key, params).
export function describeGoalProgress(goal, { correctCount, wrongCount, elapsedMs }) {
  const total = correctCount + wrongCount;
  const reached = isGoalReached(goal, { correctCount, wrongCount, elapsedMs });
  if (goal.type === 'count') {
    return { reached, key: 'testgoal.progressCount', params: { current: total, target: goal.value } };
  }
  if (goal.type === 'duration') {
    const current = formatDuration(elapsedMs / 1000);
    const target = formatDuration(goal.value);
    return { reached, key: 'testgoal.progressDuration', params: { current, target } };
  }
  if (goal.type === 'accuracy') {
    const rateNow = total === 0 ? 0 : Math.round((correctCount / total) * 100);
    return {
      reached,
      key: 'testgoal.progressAccuracy',
      params: { current: total, minCards: goal.minCards, rateNow, rateTarget: goal.value },
    };
  }
  throw new Error(`Unbekannte Zielart: ${goal.type}`);
}

export function describeGoalLabel(goal) {
  if (goal.type === 'count') return { key: 'testgoal.labelCount', params: { value: goal.value } };
  if (goal.type === 'duration') return { key: 'testgoal.labelDuration', params: { value: formatDuration(goal.value) } };
  if (goal.type === 'accuracy') return { key: 'testgoal.labelAccuracy', params: { value: goal.value, minCards: goal.minCards } };
  throw new Error(`Unbekannte Zielart: ${goal.type}`);
}
