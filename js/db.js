// FR - acesso ao Firebase (login anônimo do aparelho, funcionários, veículos e FRs).
// O Firestore guarda as gravações no celular e envia quando houver internet.

(function (global) {
  const C = global.FR_CONFIG;
  const app = firebase.initializeApp(C.firebase);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  if (C.EMULADOR) {
    auth.useEmulator(`http://${C.EMULADOR_HOST}:9098`, { disableWarnings: true });
    fs.useEmulator(C.EMULADOR_HOST, 8086);
  }
  fs.enablePersistence({ synchronizeTabs: true }).catch(() => { /* navegador sem suporte: segue só online */ });

  const agoraServidor = () => firebase.firestore.FieldValue.serverTimestamp();
  const docs = snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  // Campos da FR que só o banco grava (datas do servidor e o dono)
  const SO_BANCO = ['uid', 'criadoEm', 'atualizadoEm', 'editadoAdmEm', 'reabertaEm', 'impressaEm', 'recebidaEm', 'preparadaEm', 'fechadaAutoEm'];
  // Cópia da FR para gravar: sem os campos "_" (só do celular), sem os do banco e sem o id
  function semControle(fr, manter = []) {
    const dados = {};
    Object.keys(fr).forEach(k => { if (k[0] !== '_' && k !== 'id' && (!SO_BANCO.includes(k) || manter.includes(k))) dados[k] = fr[k]; });
    return dados;
  }

  let usuarioPronto = null;
  // Usuário atual (anônimo no app do funcionário, e-mail/senha no ADM)
  function usuario() {
    if (!usuarioPronto) {
      usuarioPronto = new Promise(resolve => {
        const parar = auth.onAuthStateChanged(async u => {
          if (u) { parar(); resolve(u); return; }
          try { await auth.signInAnonymously(); } catch (e) { console.error('[db] login anônimo', e); }
        });
      });
    }
    return usuarioPronto;
  }

  // ---------- funcionário / RGF ----------
  const refFunc = rgf => fs.collection('funcionarios').doc(rgf);

  // Situação de um RGF para este aparelho:
  // 'novo' (ninguém cadastrou), 'pronto' (o ADM cadastrou e está livre), 'meu', 'ocupado' (outro celular)
  async function consultarRgf(rgf) {
    const u = await usuario();
    const snap = await refFunc(rgf).get({ source: 'server' });
    const d = snap.exists ? snap.data() : null;
    if (!d) return { situacao: 'novo' };
    if (d.uid === u.uid) return { situacao: 'meu', dados: d };
    if (!d.uid) return { situacao: d.aprovado ? 'pronto' : 'novo', dados: d };
    return { situacao: 'ocupado', dados: d };
  }

  // Liga o RGF a este aparelho. RGF que o ADM não cadastrou fica esperando aprovação.
  // Resultado: { ok: true, aprovado } | { ok: false, motivo: 'ocupado', nome }
  async function vincularRgf({ rgf, nome, cargo }) {
    const u = await usuario();
    return fs.runTransaction(async t => {
      const snap = await t.get(refFunc(rgf));
      const d = snap.exists ? snap.data() : null;
      if (!d) {
        t.set(refFunc(rgf), { rgf, nome, cargo, uid: u.uid, aprovado: false, vinculadoEm: agoraServidor(), atualizadoEm: agoraServidor(), visto: false });
        return { ok: true, aprovado: false };
      }
      if (d.uid === u.uid) return { ok: true, aprovado: !!d.aprovado };
      if (!d.uid) {
        // Cadastro feito pelo ADM: vale o nome e o cargo que ele digitou
        const dados = { uid: u.uid, vinculadoEm: agoraServidor(), atualizadoEm: agoraServidor(), visto: false, pedidoUid: null, pedidoEm: null, pedidoMotivo: null };
        if (!d.aprovado) Object.assign(dados, { nome, cargo });
        t.update(refFunc(rgf), dados);
        return { ok: true, aprovado: !!d.aprovado };
      }
      return { ok: false, motivo: 'ocupado', nome: d.nome };
    });
  }

  async function pedirLiberacao(rgf, motivo) {
    const u = await usuario();
    await refFunc(rgf).update({ pedidoUid: u.uid, pedidoEm: agoraServidor(), pedidoMotivo: motivo });
  }

  // Acompanha o RGF deste aparelho: avisa se o ADM liberou/desvinculou
  async function observarRgf(rgf, cb) {
    const u = await usuario();
    return refFunc(rgf).onSnapshot(s => {
      const d = s.exists ? s.data() : null;
      cb({ existe: !!d, meu: !!d && d.uid === u.uid, aprovado: !!d && !!d.aprovado, dados: d, cache: s.metadata.fromCache });
    }, e => console.warn('[db] observarRgf', e));
  }

  // ---------- veículos ----------
  // Escuta ao vivo só depois do login do aparelho (antes disso o banco recusa); se cair, tenta de novo
  function ouvir(nome, consulta, cb) {
    let parar = null, fim = false;
    const ligar = () => usuario().then(() => {
      if (fim) return;
      parar = consulta().onSnapshot(cb, e => {
        console.warn('[db] ' + nome, e.code || e);
        parar = null;
        if (!fim) setTimeout(ligar, 3000);
      });
    });
    ligar();
    return () => { fim = true; if (parar) parar(); };
  }

  function observarVeiculos(cb) {
    return ouvir('veiculos', () => fs.collection('veiculos'), s => {
      const lista = docs(s).filter(v => v.ativo !== false)
        .sort((a, b) => (a.modelo || '').localeCompare(b.modelo || '') || (a.placa || '').localeCompare(b.placa || ''));
      cb(lista);
    });
  }

  // ---------- FRs ----------
  // Grava a FR e o "último estado" do veículo numa vez só. Não espera o servidor:
  // sem internet a gravação fica na fila e sobe sozinha depois.
  async function salvarFr(fr) {
    const u = await usuario();
    const batch = fs.batch();
    const dados = Object.assign(semControle(fr), { uid: u.uid, atualizadoEm: agoraServidor() });
    if (!fr._enviada) { dados.criadoEm = agoraServidor(); fr._enviada = true; }
    batch.set(fs.collection('frs').doc(fr.id), dados, { merge: true });
    if (fr.veiculoId && fr.status === 'fechada') batch.update(fs.collection('veiculos').doc(fr.veiculoId), estadoVeiculo(fr, true));
    const envio = batch.commit();
    envio.catch(e => console.error('[db] salvarFr', e));
    return { enviado: envio };
  }

  // "Último estado" do veículo depois da FR encerrada (com os defeitos marcados com X, se vierem da inspeção)
  function estadoVeiculo(fr, comDefeitos) {
    const km = global.FR.medidor(fr).ler(fr.retorno_km); // km inteiro ou horímetro com decimal
    const atual = {
      ultimaFrEm: agoraServidor(), ultimaFrId: fr.id,
      ultimoCondutor: fr.condutor || '', ultimoRgf: fr.rgf,
      ultimoCombustivel: fr.combustivel_retorno || fr.combustivel || '',
    };
    if (comDefeitos) atual.defeitosAbertos = fr.defeitosAbertos || [];
    if (km != null) atual.ultimoKm = km;
    return atual;
  }

  // FR aberta deste RGF que está no banco (feita em outro celular ou antes de trocar de celular).
  // Precisa de internet; sem internet devolve null e o app segue com o que tem no celular.
  async function frAbertaDoRgf(rgf) {
    try {
      const s = await fs.collection('frs').where('rgf', '==', rgf).where('status', '==', 'aberta').get({ source: 'server' });
      const lista = docs(s).sort((a, b) => ms(b.atualizadoEm) - ms(a.atualizadoEm));
      return lista[0] || null;
    } catch (e) {
      console.warn('[db] frAbertaDoRgf', e);
      return null;
    }
  }
  const ms = ts => (ts && ts.toMillis ? ts.toMillis() : 0);

  // Este celular passa a ser o dono da FR (mesmo RGF, celular novo)
  async function assumirFr(id) {
    const u = await usuario();
    await fs.collection('frs').doc(id).update({ uid: u.uid, atualizadoEm: agoraServidor() });
  }

  // Acompanha a FR aberta (paradas que o colega registrou, troca de funcionário feita pelo ADM)
  function observarFr(id, cb, erro) {
    return fs.collection('frs').doc(id).onSnapshot(s => {
      cb(s.exists ? Object.assign({ id: s.id }, s.data()) : null, s.metadata);
    }, e => { console.warn('[db] observarFr', e.code || e); if (erro) erro(e); });
  }

  // FRs que colegas compartilharam com este celular
  async function observarCompartilhadas(cb) {
    const u = await usuario();
    return fs.collection('frs').where('compartilhadoUids', 'array-contains', u.uid).onSnapshot(s => {
      cb(docs(s).filter(f => f.status === 'aberta'));
    }, e => console.warn('[db] compartilhadas', e));
  }

  // Colega registra paradas na FR compartilhada (só o itinerário; o resto é do dono)
  function salvarItinerario(fr) {
    const envio = fs.collection('frs').doc(fr.id).update({ itinerario: fr.itinerario, atualizadoEm: agoraServidor() });
    envio.catch(e => console.error('[db] salvarItinerario', e));
    return envio;
  }

  // Colega devolve o carro: sai do compartilhamento
  async function sairDaFr(fr) {
    const u = await usuario();
    return fs.collection('frs').doc(fr.id).update({
      compartilhadoUids: (fr.compartilhadoUids || []).filter(x => x !== u.uid),
      compartilhadoCom: (fr.compartilhadoCom || []).filter(c => c.uid !== u.uid),
      atualizadoEm: agoraServidor(),
    });
  }

  // Dados de um colega para compartilhar a FR (precisa estar usando o app)
  async function colega(rgf) {
    const snap = await refFunc(rgf).get({ source: 'server' });
    const d = snap.exists ? snap.data() : null;
    if (!d) return { erro: 'RGF não encontrado' };
    if (!d.uid || !d.aprovado) return { erro: `${d.nome} ainda não está usando o app` };
    return { uid: d.uid, rgf, nome: d.nome };
  }

  // FRs deste RGF (para "Minhas FRs anteriores"); só consulta por RGF, sem índice composto
  async function frsDoRgf(rgf) {
    const s = await fs.collection('frs').where('rgf', '==', rgf).limit(80).get();
    return docs(s);
  }
  // Km de retorno corrigido numa FR encerrada: a FR do mesmo veículo que saiu com o km errado recebe o certo.
  // Preparada (ninguém começou): troca direto. Aberta: só o pedido (correcaoKm); o celular do funcionário
  // aplica, sem perder o que ainda não subiu. Devolve quantas FRs foram corrigidas.
  async function corrigirKmEmCadeia(base, fr, antes, por) {
    const m = global.FR.medidor(fr);
    const de = m.ler(antes && antes.retorno_km), para = m.ler(fr.retorno_km);
    if (!fr.veiculoId || fr.status !== 'fechada' || de == null || para == null || de === para) return 0;
    const s = await base.collection('frs').where('veiculoId', '==', fr.veiculoId).get();
    const alvo = docs(s).filter(f => f.id !== fr.id && ['aberta', 'preparada'].includes(f.status) && m.ler(f.partida_km) === de);
    if (!alvo.length) return 0;
    const batch = base.batch();
    alvo.forEach(f => {
      const ref = base.collection('frs').doc(f.id);
      if (f.status === 'preparada') batch.update(ref, { partida_km: m.texto(para), kmEsperado: m.texto(para), atualizadoEm: agoraServidor() });
      else batch.update(ref, { correcaoKm: { de: m.texto(de), para: m.texto(para), por: por || 'O ADM', em: Date.now() }, atualizadoEm: agoraServidor() });
    });
    await batch.commit();
    return alvo.length;
  }
  const avisoCadeia = n => (n ? `Correção salva. O km de saída também foi corrigido em ${n === 1 ? 'uma FR em aberto' : n + ' FRs em aberto'} deste veículo.` : 'Correção salva');

  // O funcionário corrige a própria FR encerrada. Feita em outro celular: este assume antes.
  // Se ela foi a última do veículo, o km de retorno corrigido vai para o veículo.
  async function salvarFrFuncionario(fr, uidNoBanco, veiculo) {
    const u = await usuario();
    const ref = fs.collection('frs').doc(fr.id);
    if (uidNoBanco !== u.uid) ref.update({ uid: u.uid, atualizadoEm: agoraServidor() }).catch(e => console.warn('[db] assumir', e.code || e));
    const batch = fs.batch();
    batch.set(ref, Object.assign(semControle(fr), { uid: u.uid, atualizadoEm: agoraServidor() }), { merge: true });
    if (veiculo && veiculo.ultimaFrId === fr.id && fr.status === 'fechada') batch.update(fs.collection('veiculos').doc(veiculo.id), estadoVeiculo(fr, false));
    return batch.commit();
  }

  // FRs que o chefe preparou para este RGF (ao vivo)
  function observarPreparadas(rgf, cb) {
    return ouvir('preparadas', () => fs.collection('frs').where('rgf', '==', rgf).where('status', '==', 'preparada'), s => {
      cb(docs(s).sort((a, b) => (a.data || '').localeCompare(b.data || '')));
    });
  }

  // Passa a FR (preparada, ou do chefe) para outro funcionário. por: quem passou
  function passarFr(id, f, por) {
    return fs.collection('frs').doc(id).update({
      rgf: f.rgf, condutor: f.nome || '', cargo: f.cargo || '', passadaPor: por || null, atualizadoEm: agoraServidor(),
    });
  }

  // Marca as FRs como impressas (o chefe vê quais já foram para o papel)
  function marcarImpressas(ids, por) {
    const batch = fs.batch();
    ids.forEach(id => batch.update(fs.collection('frs').doc(id), { impressaEm: agoraServidor(), impressaPor: por || '', atualizadoEm: agoraServidor() }));
    const envio = batch.commit();
    envio.catch(e => console.warn('[db] marcarImpressas', e.code || e));
    return envio;
  }

  // ---------- chefe ----------
  // O celular do chefe se registra para poder ver as FRs da equipe (as regras conferem o RGF)
  async function registrarChefe(p) {
    const u = await usuario();
    await fs.collection('chefes').doc(u.uid).set({ rgf: p.rgf, nome: p.nome || '', em: agoraServidor() });
  }
  async function deixarChefe() {
    const u = await usuario();
    await fs.collection('chefes').doc(u.uid).delete().catch(() => {});
  }
  function observarEquipe(cb, erro) {
    return fs.collection('funcionarios').onSnapshot(s => cb(docs(s)), e => { console.warn('[db] equipe', e.code || e); if (erro) erro(e); });
  }
  // FRs do painel do chefe: as de hoje, as abertas e as preparadas (de qualquer dia).
  // Três consultas simples (sem índice composto); o resultado junta as três.
  function observarPainel(hoje, cb, erro) {
    const partes = [{}, {}, {}];
    const ref = fs.collection('frs');
    const consultas = [ref.where('data', '==', hoje), ref.where('status', '==', 'aberta'), ref.where('status', '==', 'preparada')];
    const prontas = [false, false, false];
    const paradas = consultas.map((q, i) => q.onSnapshot(s => {
      partes[i] = {};
      s.docs.forEach(d => { partes[i][d.id] = Object.assign({ id: d.id }, d.data()); });
      prontas[i] = true;
      if (prontas.every(Boolean)) cb(Object.values(Object.assign({}, partes[0], partes[1], partes[2])), s.metadata.fromCache);
    }, e => { console.warn('[db] painel', e.code || e); if (erro) erro(e); }));
    return () => paradas.forEach(p => p());
  }
  // FRs dos dias anteriores, da mais nova para a mais velha, de 40 em 40
  async function frsAnteriores(antesDe, depoisDe) {
    let q = fs.collection('frs').where('data', '<', antesDe).orderBy('data', 'desc').limit(40);
    if (depoisDe) q = q.startAfter(depoisDe);
    const s = await q.get();
    return { lista: docs(s), ultimo: s.docs[s.docs.length - 1] || null };
  }
  async function criarFrPreparada(fr) {
    const u = await usuario();
    const dados = Object.assign(semControle(fr), { uid: u.uid, preparadaEm: agoraServidor(), criadoEm: agoraServidor(), atualizadoEm: agoraServidor() });
    return fs.collection('frs').doc(fr.id).set(dados);
  }
  // Correção do chefe na ficha completa: o celular do funcionário pega a versão nova
  // Encerrada e última do veículo: o km de retorno corrigido vai para o veículo
  // antes: a FR como estava (se o km de retorno mudou, corrige em cadeia a FR seguinte do veículo)
  async function salvarFrChefe(fr, por, veiculo, antes) {
    const dados = semControle(fr);
    ['rgf', 'preparadaPor'].forEach(k => delete dados[k]);
    Object.assign(dados, { editadoAdmEm: agoraServidor(), editadoPor: por, atualizadoEm: agoraServidor() });
    const batch = fs.batch();
    batch.update(fs.collection('frs').doc(fr.id), dados);
    if (veiculo && fr.status === 'fechada' && kmMaisNovo(fr, veiculo)) batch.update(fs.collection('veiculos').doc(veiculo.id), estadoVeiculo(fr, false));
    await batch.commit();
    return avisoCadeia(await corrigirKmEmCadeia(fs, fr, antes, por).catch(e => { console.warn('[db] km em cadeia', e.code || e); return 0; }));
  }
  // O km de retorno da FR vai para o veículo se ela é a última dele, ou se o km é o maior registrado
  function kmMaisNovo(fr, veiculo) {
    if (veiculo.ultimaFrId === fr.id) return true;
    const km = global.FR.medidor(fr).ler(fr.retorno_km);
    return km != null && (veiculo.ultimoKm == null || km >= veiculo.ultimoKm);
  }
  // Chefe libera de novo a FR encerrada (o funcionário continua no celular dele)
  function reabrirFrChefe(id) {
    return fs.collection('frs').doc(id).update({ status: 'aberta', reabertaEm: agoraServidor(), atualizadoEm: agoraServidor() });
  }
  // FR cancelada não fica guardada. Preparada (ninguém começou): apaga já. Em serviço: marca como
  // cancelada para o celular do funcionário saber, e ele (ou a limpeza diária) apaga.
  function cancelarFrChefe(f, por) {
    const ref = fs.collection('frs').doc(f.id);
    if (f.status === 'preparada') return ref.delete();
    return ref.update({ status: 'cancelada', canceladaPor: por, atualizadoEm: agoraServidor() });
  }
  // O funcionário cancela a própria FR: ela sai do banco (sem internet, fica na fila)
  function excluirFr(id) {
    const envio = fs.collection('frs').doc(id).delete();
    envio.catch(e => console.warn('[db] excluirFr', e.code || e));
    return envio;
  }
  // FR feita no papel voltou: anota o km e encerra. O veículo só recebe o km se ele for o mais novo.
  async function receberPapel(fr, dados, veiculo, por) {
    const batch = fs.batch();
    const x = Object.assign({}, fr, dados);
    batch.update(fs.collection('frs').doc(fr.id), Object.assign({}, dados, { status: 'fechada', recebidaEm: agoraServidor(), recebidaPor: por, atualizadoEm: agoraServidor() }));
    const m = global.FR.medidor(x);
    const km = m.ler(x.retorno_km);
    if (veiculo && km != null && (veiculo.ultimoKm == null || km >= veiculo.ultimoKm)) {
      batch.update(fs.collection('veiculos').doc(veiculo.id), estadoVeiculo(x, false));
    }
    await batch.commit();
    // Km de retorno trocado numa FR já encerrada: segue para a FR seguinte do veículo
    return avisoCadeia(await corrigirKmEmCadeia(fs, Object.assign({}, x, { status: 'fechada' }), fr, por).catch(() => 0));
  }
  // FRs preparadas de dias anteriores que ninguém encerrou: fecham sozinhas
  function fecharAntigas(lista) {
    if (!lista.length) return Promise.resolve();
    const batch = fs.batch();
    lista.forEach(f => batch.update(fs.collection('frs').doc(f.id), { status: 'fechada', fechadaAuto: true, fechadaAutoEm: agoraServidor(), atualizadoEm: agoraServidor() }));
    return batch.commit();
  }
  // FRs encerradas/canceladas abertas há mais de 30 dias saem do banco (as regras conferem)
  async function limparAntigas(base) {
    const limite = firebase.firestore.Timestamp.fromMillis(Date.now() - 31 * 86400000);
    const s = await (base || fs).collection('frs').where('criadoEm', '<', limite).limit(300).get();
    const canceladas = await (base || fs).collection('frs').where('status', '==', 'cancelada').limit(300).get();
    const velhas = docs(s).filter(f => f.status === 'fechada').concat(docs(canceladas));
    for (let i = 0; i < velhas.length; i += 400) {
      const batch = (base || fs).batch();
      velhas.slice(i, i + 400).forEach(f => batch.delete((base || fs).collection('frs').doc(f.id)));
      await batch.commit();
    }
    return velhas.length;
  }

  // ---------- locais (lista compartilhada) ----------
  // Um documento só (listas/locais): abrir o app custa 1 leitura, não 1 por local
  const refLocais = () => fs.collection('listas').doc('locais');
  const paraLista = itens => Object.entries(itens || {}).map(([chave, l]) => ({ chave, texto: l.texto, n: l.n || 0 }));
  function observarLocais(cb) {
    return ouvir('locais', refLocais, s => cb(paraLista(s.exists ? s.data().itens : {})));
  }
  // Local novo entra na lista; local que já existe ganha +1 no uso (para subir nas sugestões).
  // Sem internet fica na fila como o resto.
  // Devolve a gravação (resolve quando o servidor confirma).
  function registrarLocal(texto, chave, rgf, existente) {
    const item = existente ? { n: firebase.firestore.FieldValue.increment(1) } : { texto, n: firebase.firestore.FieldValue.increment(1) };
    const envio = refLocais().set({ itens: { [chave]: item }, ultimaChave: chave, porRgf: rgf, atualizadoEm: agoraServidor() }, { merge: true });
    envio.catch(e => console.warn('[db] registrarLocal', e.code || e));
    return envio;
  }
  // Chaves dos locais que estão no servidor (depois que a fila de gravações deste celular subiu)
  async function chavesLocaisNoServidor() {
    await fs.waitForPendingWrites();
    const s = await refLocais().get({ source: 'server' });
    return Object.keys((s.exists && s.data().itens) || {});
  }

  async function minhasFrs() {
    const u = await usuario();
    const s = await fs.collection('frs').where('uid', '==', u.uid).get();
    return docs(s).sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 30);
  }

  // ---------- ADM ----------
  // Sessão separada (outro app do Firebase): o login do ADM não derruba o login anônimo
  // do aparelho, que é o dono do RGF do funcionário.
  let admFs = null, admAuth = null;
  function iniciarAdm() {
    if (admFs) return;
    const a = firebase.initializeApp(C.firebase, 'adm');
    admAuth = a.auth();
    admFs = a.firestore();
    if (C.EMULADOR) {
      admAuth.useEmulator(`http://${C.EMULADOR_HOST}:9098`, { disableWarnings: true });
      admFs.useEmulator(C.EMULADOR_HOST, 8086);
    }
  }
  const admFunc = rgf => admFs.collection('funcionarios').doc(rgf);

  async function entrarAdm(email, senha) {
    iniciarAdm();
    const cred = await admAuth.signInWithEmailAndPassword(email, senha);
    const reg = await admFs.collection('admins').doc(cred.user.uid).get();
    if (!reg.exists) { await admAuth.signOut(); throw new Error('Esta conta não é de ADM'); }
    return cred.user;
  }
  async function sairAdm() {
    if (admAuth) await admAuth.signOut();
  }
  // Sessão do ADM continua salva entre aberturas do app
  async function souAdm() {
    iniciarAdm();
    const u = await new Promise(r => { const p = admAuth.onAuthStateChanged(x => { p(); r(x); }); });
    if (!u) return false;
    try { return (await admFs.collection('admins').doc(u.uid).get()).exists; } catch (e) { return false; }
  }

  const adm = {
    observarFuncionarios(cb) {
      return admFs.collection('funcionarios').onSnapshot(s => cb(docs(s)), e => console.warn('[adm] funcionarios', e));
    },
    marcarVisto: rgf => admFunc(rgf).update({ visto: true }),
    // Passa o RGF para o aparelho que pediu
    liberarPedido: f => admFunc(f.rgf).update({
      uid: f.pedidoUid, vinculadoEm: agoraServidor(), visto: true, pedidoUid: null, pedidoEm: null, pedidoMotivo: null,
    }),
    recusarPedido: rgf => admFunc(rgf).update({ pedidoUid: null, pedidoEm: null, pedidoMotivo: null }),
    // Solta o RGF: o próximo aparelho que digitar esse RGF fica com ele
    desvincular: rgf => admFunc(rgf).update({ uid: null, pedidoUid: null, pedidoEm: null, pedidoMotivo: null }),
    excluirFuncionario: rgf => admFunc(rgf).delete(),
    aprovar: rgf => admFunc(rgf).update({ aprovado: true, visto: true }),
    // Cadastro pronto: o funcionário só digita o RGF e confirma. Editar não mexe no celular vinculado.
    // papel: 'chefe' ou '' (funcionário)
    async salvarFuncionario({ rgf, nome, cargo, papel }) {
      const ref = admFunc(rgf);
      const snap = await ref.get();
      if (snap.exists) return ref.update({ nome, cargo, papel: papel || '', atualizadoEm: agoraServidor() });
      return ref.set({ rgf, nome, cargo, papel: papel || '', uid: null, aprovado: true, visto: true, criadoEm: agoraServidor(), atualizadoEm: agoraServidor() });
    },

    observarVeiculos(cb) {
      return admFs.collection('veiculos').onSnapshot(s => cb(docs(s).sort((a, b) => (a.modelo || '').localeCompare(b.modelo || ''))));
    },
    salvarVeiculo(v) {
      const { id, ...dados } = v;
      const ref = id ? admFs.collection('veiculos').doc(id) : admFs.collection('veiculos').doc();
      return ref.set(Object.assign(dados, { atualizadoEm: agoraServidor() }), { merge: true });
    },
    excluirVeiculo: id => admFs.collection('veiculos').doc(id).delete(),
    excluirFr: id => admFs.collection('frs').doc(id).delete(),
    // Passa a FR para outro funcionário (o celular dele assume a FR quando abrir o app)
    trocarFuncionario: (id, f) => admFs.collection('frs').doc(id).update({
      rgf: f.rgf, condutor: f.nome || '', cargo: f.cargo || '', atualizadoEm: agoraServidor(),
    }),
    observarLocais(cb) {
      return admFs.collection('listas').doc('locais').onSnapshot(s => cb(paraLista(s.exists ? s.data().itens : {})), e => console.warn('[adm] locais', e));
    },
    // Corrigir o nome muda a chave: o uso vai junto (e soma, se o nome certo já existir)
    renomearLocal: (l, texto, chave, usoDoCerto) => {
      const ref = admFs.collection('listas').doc('locais');
      const campo = k => new firebase.firestore.FieldPath('itens', k);
      const item = { texto, n: (l.n || 0) + (usoDoCerto || 0) };
      if (chave === l.chave) return ref.update(campo(chave), item); // só acento/maiúscula do texto
      return ref.update(campo(l.chave), firebase.firestore.FieldValue.delete(), campo(chave), item);
    },
    excluirLocal: l => admFs.collection('listas').doc('locais').update(new firebase.firestore.FieldPath('itens', l.chave), firebase.firestore.FieldValue.delete()),
    // Correção feita pelo ADM na ficha completa (dono, RGF e datas do banco não mudam)
    // Encerrada: o km de retorno corrigido vai para o veículo (se ela é a última dele ou o km é o maior)
    // e para a FR seguinte do veículo que saiu com o km errado (antes = a FR como estava)
    async salvarFrAdm(fr, antes) {
      const dados = semControle(fr);
      delete dados.rgf;
      dados.editadoPor = 'O ADM';
      dados.editadoAdmEm = agoraServidor();
      dados.atualizadoEm = agoraServidor();
      const batch = admFs.batch();
      batch.update(admFs.collection('frs').doc(fr.id), dados);
      if (fr.veiculoId && fr.status === 'fechada') {
        const v = await admFs.collection('veiculos').doc(fr.veiculoId).get().catch(() => null);
        if (v && v.exists && kmMaisNovo(fr, Object.assign({ id: v.id }, v.data()))) batch.update(v.ref, estadoVeiculo(fr, false));
      }
      await batch.commit();
      return avisoCadeia(await corrigirKmEmCadeia(admFs, fr, antes, 'O ADM').catch(e => { console.warn('[adm] km em cadeia', e.code || e); return 0; }));
    },
    // FR encerrada/cancelada sem querer: volta a ficar aberta e o celular do funcionário pega de novo
    reabrirFr: id => admFs.collection('frs').doc(id).update({ status: 'aberta', reabertaEm: agoraServidor(), atualizadoEm: agoraServidor() }),
    compartilharFr: (id, lista) => admFs.collection('frs').doc(id).update({
      compartilhadoUids: lista.map(c => c.uid), compartilhadoCom: lista, atualizadoEm: agoraServidor(),
    }),
    darBaixaDefeito: (id, lista) => admFs.collection('veiculos').doc(id).update({ defeitosAbertos: lista }),

    async frs() {
      const s = await admFs.collection('frs').orderBy('data', 'desc').limit(100).get();
      return docs(s);
    },
    // Controle de frota: FRs em serviço e preparadas, ao vivo
    observarFrsAtivas(cb) {
      return admFs.collection('frs').where('status', 'in', ['aberta', 'preparada'])
        .onSnapshot(s => cb(docs(s)), e => console.warn('[adm] frota', e.code || e));
    },
    limparAntigas: () => limparAntigas(admFs),
  };

  global.FrDb = {
    usuario, consultarRgf, vincularRgf, pedirLiberacao, observarRgf,
    observarVeiculos, salvarFr, minhasFrs,
    observarLocais, registrarLocal, chavesLocaisNoServidor,
    frAbertaDoRgf, assumirFr, observarFr, observarCompartilhadas, salvarItinerario, sairDaFr, colega,
    observarPreparadas, passarFr, marcarImpressas, frsDoRgf, salvarFrFuncionario,
    registrarChefe, deixarChefe, observarEquipe, observarPainel, frsAnteriores, criarFrPreparada, salvarFrChefe,
    cancelarFrChefe, excluirFr, receberPapel, reabrirFrChefe, fecharAntigas, limparAntigas, SO_BANCO,
    entrarAdm, sairAdm, souAdm, adm,
    novoId: () => fs.collection('frs').doc().id,
  };
})(window);
