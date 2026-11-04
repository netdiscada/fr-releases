// FR - cópia das FRs impressas numa pasta do computador (Chrome/Edge no PC: File System Access API).
// O chefe escolhe a pasta uma vez; cada FR impressa vira um PDF em <pasta>/<ano>-<mês>/.
// A pasta escolhida fica guardada no navegador (IndexedDB). Celular e APK não têm isso.

(function (global) {
  const suportado = typeof global.showDirectoryPicker === 'function' && !(global.FR && global.FR.nativo);
  const MESES = ['01-Janeiro', '02-Fevereiro', '03-Marco', '04-Abril', '05-Maio', '06-Junho', '07-Julho',
    '08-Agosto', '09-Setembro', '10-Outubro', '11-Novembro', '12-Dezembro'];

  // ---------- IndexedDB (só guarda o "endereço" da pasta) ----------
  function banco() {
    return new Promise((ok, erro) => {
      const r = indexedDB.open('fr-backup', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => erro(r.error);
    });
  }
  async function lerChave(k) {
    const db = await banco();
    return new Promise(ok => {
      const r = db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  }
  async function gravarChave(k, v) {
    const db = await banco();
    return new Promise((ok, erro) => {
      const t = db.transaction('kv', 'readwrite');
      if (v == null) t.objectStore('kv').delete(k); else t.objectStore('kv').put(v, k);
      t.oncomplete = () => ok();
      t.onerror = () => erro(t.error);
    });
  }

  let pastaCache;
  async function pasta() {
    if (!suportado) return null;
    if (pastaCache === undefined) {
      try { pastaCache = await lerChave('pasta'); } catch (e) { pastaCache = null; }
    }
    return pastaCache;
  }

  async function escolher() {
    const h = await global.showDirectoryPicker({ id: 'fr-backup', mode: 'readwrite' });
    pastaCache = h;
    await gravarChave('pasta', h);
    return h;
  }
  async function esquecer() { pastaCache = null; await gravarChave('pasta', null); }

  // O navegador pede licença de novo depois de fechar: só funciona logo depois de um clique
  async function liberada(pedir) {
    const h = await pasta();
    if (!h) return false;
    const op = { mode: 'readwrite' };
    if ((await h.queryPermission(op)) === 'granted') return true;
    if (!pedir) return false;
    try { return (await h.requestPermission(op)) === 'granted'; } catch (e) { return false; }
  }

  // FR_ANTONIO_DE_SOUZA_VIEIRA_27-10-2026_GBI2447.pdf: a placa separa duas FRs do mesmo dia
  function nome(fr) {
    const base = global.FR.nomeArquivo(fr).replace(/\.pdf$/i, '');
    const extra = String(fr.placa || fr.tombamento || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `${base}${extra ? '_' + extra : ''}.pdf`;
  }

  // Guarda a cópia (sem esperar; se não der, avisa uma vez)
  let avisou = false;
  function guardar(fr, bytes) {
    if (!suportado) return;
    (async () => {
      const h = await pasta();
      if (!h) return;
      if (!(await liberada(true))) {
        if (!avisou) { avisou = true; global.FR.avisar('Sem licença para salvar na pasta de backup. Abra "Impressão e backup".', 'erro'); }
        return;
      }
      const [a, m] = (fr.data || global.FR.hoje()).split('-');
      const mes = await h.getDirectoryHandle(`${a}-${MESES[Number(m) - 1] || m}`, { create: true });
      const arq = await mes.getFileHandle(nome(fr), { create: true });
      const w = await arq.createWritable();
      await w.write(bytes);
      await w.close();
    })().catch(e => {
      console.warn('[backup]', e);
      if (!avisou) { avisou = true; global.FR.avisar('Não foi possível salvar a cópia na pasta de backup', 'erro'); }
    });
  }

  global.FrBackup = { suportado, pasta, escolher, esquecer, liberada, guardar, nome };
})(window);
