// Sitzungsaufbau für den Lernmodus: Reihenfolgen, Einstreuen der Reparaturkiste,
// Wiedervorlage falsch beantworteter Karten. Reine Funktionen ohne DOM-Zugriff.

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function orderCards(cards, order) {
  if (order === 'random') return shuffled(cards);
  if (order === 'box') return [...cards].sort((a, b) => a.box - b.box);
  return [...cards]; // 'sequential': Eingabereihenfolge, bereits so übergeben
}

// Zieht abwechselnd bis zu `primaryCount` aus `primary` und bis zu `secondaryCount` aus
// `secondary`, bis beide Listen aufgebraucht sind. Reparaturkarten werden so bevorzugt,
// aber nicht am Stück gezogen.
function interleave(primary, secondary, primaryCount, secondaryCount) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < primary.length || j < secondary.length) {
    for (let k = 0; k < primaryCount && i < primary.length; k++) result.push(primary[i++]);
    for (let k = 0; k < secondaryCount && j < secondary.length; k++) result.push(secondary[j++]);
  }
  return result;
}

// Baut die Liste der Karten-IDs für eine Sitzung. `order` ist 'random' | 'sequential' | 'box'.
export function buildQueue(cards, { order = 'random', onlyMarked = false } = {}) {
  const pool = onlyMarked ? cards.filter((c) => c.marked) : cards;
  const repairCards = orderCards(pool.filter((c) => c.repair), order);
  const regularCards = orderCards(pool.filter((c) => !c.repair), order);
  return interleave(repairCards, regularCards, 2, 3).map((c) => c.id);
}

// Verwaltet die Ziehreihenfolge während der Sitzung. Eine falsch beantwortete Karte wird so
// wieder eingefügt, dass mindestens drei weitere Karten dazwischenliegen, bevor sie erneut
// gezogen werden kann.
export function createSessionQueue(ids) {
  const queue = [...ids];
  return {
    isEmpty: () => queue.length === 0,
    size: () => queue.length,
    draw: () => queue.shift(),
    requeueAfterWrong: (cardId) => {
      const insertAt = Math.min(3, queue.length);
      queue.splice(insertAt, 0, cardId);
    },
    // Entfernt eine noch ausstehende Wiedervorlage, etwa wenn eine Korrektur eine falsche
    // Bewertung nachträglich in richtig ändert.
    remove: (cardId) => {
      const idx = queue.indexOf(cardId);
      if (idx !== -1) queue.splice(idx, 1);
    },
    // Hängt weitere Karten-IDs an, etwa wenn der Testmodus den Stapel erneut durchläuft,
    // weil das gewählte Ziel noch nicht erreicht ist.
    enqueueMany: (newIds) => {
      queue.push(...newIds);
    },
  };
}
