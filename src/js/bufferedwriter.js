// Bündelt schnell aufeinanderfolgende Schreibvorgänge (z. B. eine Kastenänderung nach jeder
// bewerteten Karte) zu einem einzigen verzögerten Aufruf von writeFn, damit die Oberfläche
// flüssig bleibt. flush() erzwingt ein sofortiges Schreiben des zuletzt übergebenen Werts,
// etwa beim Verlassen der Ansicht oder vor dem Schließen der Seite.

export function createBufferedWriter(writeFn, { delay = 400 } = {}) {
  let timer = null;
  let latest = null;
  let hasPending = false;

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!hasPending) return;
    hasPending = false;
    const value = latest;
    latest = null;
    await writeFn(value);
  }

  function schedule(value) {
    latest = value;
    hasPending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delay);
  }

  return { schedule, flush };
}
