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

// Liefert eine für die Oberfläche fertige Beschreibung des aktuellen Fortschritts.
export function describeGoalProgress(goal, { correctCount, wrongCount, elapsedMs }) {
  const total = correctCount + wrongCount;
  const reached = isGoalReached(goal, { correctCount, wrongCount, elapsedMs });
  if (goal.type === 'count') {
    return { reached, text: `${total} von ${goal.value} Karten` };
  }
  if (goal.type === 'duration') {
    const current = formatDuration(elapsedMs / 1000);
    const target = formatDuration(goal.value);
    return { reached, text: `${current} von ${target} Minuten` };
  }
  if (goal.type === 'accuracy') {
    const rateNow = total === 0 ? 0 : Math.round((correctCount / total) * 100);
    return {
      reached,
      text: `${total} von mindestens ${goal.minCards} Karten · Trefferquote ${rateNow}% (Ziel ${goal.value}%)`,
    };
  }
  throw new Error(`Unbekannte Zielart: ${goal.type}`);
}

export function describeGoalLabel(goal) {
  if (goal.type === 'count') return `${goal.value} Karten`;
  if (goal.type === 'duration') return `${formatDuration(goal.value)} Minuten`;
  if (goal.type === 'accuracy') return `${goal.value}% Trefferquote ab ${goal.minCards} Karten`;
  throw new Error(`Unbekannte Zielart: ${goal.type}`);
}
