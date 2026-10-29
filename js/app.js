// FR - início do app: login do aparelho, RGF do funcionário, menu e navegação entre telas.

(function (global) {
  const F = global.FR;
  const Db = global.FrDb;
  const { $ } = F;
  const CHAVE_PEDIDO = 'fr.pedido.v1';
  const CHAVE_VEICULOS = 'fr.veiculos.v1';
  const CHAVE_LOCAIS = 'fr.locaisTodos.v2';

  // ---------- topo conforme a tela ----------
  const TITULOS = {
    inicio: ['Relatório Diário', 'SMSUZ · Mogi das Cruzes'],
    rgf: ['Relatório Diário', 'Primeiro acesso'],
    comecar: ['Começar o dia', ''],
    encerrar: ['Encerrar o dia', ''],
    ficha: ['Ficha completa', ''],
    adm: ['Área do ADM', 'Funcionários, veículos e FRs'],
    equipe: ['FRs da equipe', ''],
    preparar: ['Preparar FR', ''],
    parada: ['Nova parada', ''],
    carregando: ['Relatório Diário', ''],
  };
  const mostrar = F.mostrarTela;
  F.mostrarTela = nome => {
    const antes = document.body.dataset.tela;
    // Ao trocar de tela, a nova entra animada (avança pela direita, volta pela esquerda, a ficha abre como livro)
    if (antes && antes !== nome && global.FrAnim) global.FrAnim.trocarTela(antes, nome, () => trocar(nome));
    else trocar(nome);
  };
  function trocar(nome) {
    mostrar(nome);
    const [t, s] = TITULOS[nome] || TITULOS.inicio;
    $('#topoTitulo').textContent = t;
    const p = F.perfil();
    $('#topoSub').textContent = ['equipe', 'preparar'].includes(nome) && p ? `${p.nome} · Chefe`
      : s || (F.estado.fr && F.estado.fr.placa ? F.estado.fr.placa : '');
    // Voltar sempre no mesmo lugar (topo, à esquerda) em toda tela que não é a inicial
    $('#btnVoltar').hidden = !['ficha', 'encerrar', 'adm', 'preparar', 'parada', 'comecar'].includes(nome);
    $('#btnMenu').hidden = ['rgf', 'carregando'].includes(nome);
    // A troca com animação termina depois de quem pediu a tela: avisa quem precisa da tela já à vista
    document.dispatchEvent(new CustomEvent('fr:tela', { detail: nome }));
  }

  $('#btnVoltar').addEventListener('click', () => {
    const tela = document.body.dataset.tela;
    if (global.FrChefe && global.FrChefe.voltar()) return;
    if (tela === 'ficha' && F.estado.edicaoAdm) { F.estado.aoFimEdicao(); return; }
    if (tela === 'preparar') { $('#btnPrepararVoltar').click(); return; }
    if (tela === 'comecar') { $('#btnComecarVoltar').click(); return; }
    if (tela === 'ficha' || tela === 'encerrar') F.sincronizar();
    if (tela === 'adm') global.FrAdm.fechar();
    if (F.perfil()) global.FrDia.inicio();
    else telaRgf();
  });

  // ---------- botão voltar do Android ----------
  // Fecha a janela aberta ou volta uma tela. Só na tela inicial ele sai do app.
  function voltarUmPasso() {
    const folha = Array.from(document.querySelectorAll('.folha')).find(f => !f.hidden);
    if (folha) { const fundo = folha.querySelector('[data-fechar]'); if (fundo) fundo.click(); else folha.hidden = true; return true; }
    if (!$('#visorPdf').hidden) { $('#visorFechar').click(); return true; }
    if (global.FrChefe && global.FrChefe.voltar()) return true;
    if (!$('#btnVoltar').hidden) { $('#btnVoltar').click(); return true; }
    if (document.body.dataset.tela === 'comecar') { $('#btnComecarVoltar').click(); return true; }
    if (document.body.dataset.tela === 'preparar') { $('#btnPrepararVoltar').click(); return true; }
    return false;
  }
  const RAIZ = ['inicio', 'equipe', 'rgf', 'carregando'];
  const longeDaRaiz = () => !RAIZ.includes(document.body.dataset.tela) || !!document.querySelector('.folha:not([hidden])')
    || !$('#visorPdf').hidden || !!(global.FrChefe && global.FrChefe.emSubtela());
  if (F.nativo && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('backButton', () => { if (!voltarUmPasso()) Capacitor.Plugins.App.minimizeApp(); });
  } else {
    // Site instalado (PWA): o voltar do Android anda no histórico do navegador. Fora da tela inicial
    // fica sempre uma entrada "de reserva" no histórico; o voltar a consome e o app volta uma tela.
    const armar = () => { if (!(history.state && history.state.fr)) history.pushState({ fr: 1 }, ''); };
    global.addEventListener('popstate', () => {
      voltarUmPasso();
      setTimeout(() => { if (longeDaRaiz()) armar(); }, 0);
    });
    F.armarVoltar = () => { if (longeDaRaiz()) armar(); };
    new MutationObserver(() => F.armarVoltar()).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden', 'data-tela'] });
  }

  // ---------- RGF ----------
  // Passos: digitar o RGF → "É você?" (cadastrado pelo ADM) ou nome/cargo (RGF novo, espera aprovação)
  // → ou "RGF em outro celular" (pede liberação). O pedido pendente fica salvo para reabrir esperando.
  let pararRgf = null;
  let rgfAtual = null; // { rgf, nome, cargo } em andamento

  function passoRgf(id) {
    F.$$('.rgf-passo').forEach(p => { p.hidden = p.id !== id; });
    $('#btnRgfAdm').hidden = id !== 'rgfPasso1';
  }

  function telaRgf(mensagem) {
    $('#rgfAviso').hidden = !mensagem;
    $('#rgfAviso').textContent = mensagem || '';
    const pedido = F.ler(CHAVE_PEDIDO, null);
    if (pedido) esperar(pedido);
    else passoRgf('rgfPasso1');
    F.mostrarTela('rgf');
  }

  $('#btnRgfAdm').addEventListener('click', () => $('#btnMenuAdm').click());

  F.$$('[data-rgf-voltar]').forEach(b => b.addEventListener('click', () => {
    $('#rgfAviso').hidden = true;
    passoRgf('rgfPasso1');
  }));

  async function comBotao(btn, texto, fn) {
    const antes = btn.textContent;
    btn.disabled = true;
    btn.textContent = texto;
    try { await fn(); }
    catch (e) {
      console.error('[FR] RGF', e);
      F.avisar(/offline|unavailable/i.test(e.code || e.message) ? 'Sem internet. Para o primeiro acesso o celular precisa estar conectado.' : 'Não foi possível: ' + e.message, 'erro');
    } finally {
      btn.disabled = false;
      btn.textContent = antes;
    }
  }

  $('#btnRgfContinuar').addEventListener('click', e => comBotao(e.target, 'Conferindo…', async () => {
    const rgf = $('#rgfNumero').value.replace(/\D/g, '');
    if (rgf.length < 3) { F.avisar('Digite o seu RGF', 'erro'); return; }
    $('#rgfAviso').hidden = true;
    const r = await Db.consultarRgf(rgf);
    rgfAtual = { rgf, nome: (r.dados && r.dados.nome) || '', cargo: (r.dados && r.dados.cargo) || '', papel: (r.dados && r.dados.papel) || '' };
    if (r.situacao === 'pronto' || r.situacao === 'meu') {
      $('#rgfProntoDados').innerHTML =
        `<div><span>Nome</span><b>${F.escapar(rgfAtual.nome)}</b></div>` +
        `<div><span>RGF</span><b>${F.escapar(rgf)}</b></div>` +
        `<div><span>Cargo</span><b>${F.escapar(rgfAtual.cargo)}</b></div>`;
      passoRgf('rgfPronto');
    } else if (r.situacao === 'novo') {
      $('#rgfNome').value = rgfAtual.nome;
      $('#rgfCargo').value = rgfAtual.cargo;
      passoRgf('rgfNovo');
    } else {
      $('#rgfOcupadoTexto').textContent = `O RGF ${rgf} já está ativo no celular de ${rgfAtual.nome}. ` +
        'Cada funcionário só pode usar o app em um celular. Se este é o seu celular novo, peça a liberação ao ADM.';
      passoRgf('rgfOcupado');
    }
  }));

  async function vincular(dados) {
    const r = await Db.vincularRgf(dados);
    if (!r.ok) {
      F.avisar('Este RGF acabou de ser usado em outro celular', 'erro');
      passoRgf('rgfPasso1');
      return;
    }
    if (r.aprovado) entrou(Object.assign({}, dados, { papel: (rgfAtual && rgfAtual.papel) || '' }));
    else esperar(Object.assign({ tipo: 'aprovacao' }, dados));
  }

  $('#btnRgfSouEu').addEventListener('click', e => comBotao(e.target, 'Entrando…', () => vincular(rgfAtual)));

  $('#btnRgfPedirAcesso').addEventListener('click', e => comBotao(e.target, 'Enviando…', async () => {
    const nome = $('#rgfNome').value.trim().replace(/\s+/g, ' ');
    const cargo = $('#rgfCargo').value.trim();
    if (nome.split(' ').length < 2) { F.avisar('Digite o nome completo', 'erro'); return; }
    if (!cargo) { F.avisar('Digite o cargo ou função', 'erro'); return; }
    await vincular({ rgf: rgfAtual.rgf, nome, cargo });
  }));

  $('#btnPedirLiberacao').addEventListener('click', e => comBotao(e.target, 'Enviando…', async () => {
    await Db.pedirLiberacao(rgfAtual.rgf, 'novo_celular');
    esperar(Object.assign({ tipo: 'liberacao' }, rgfAtual));
  }));

  // Fica ouvindo o RGF até o ADM aprovar/liberar (ou recusar)
  async function esperar(pedido) {
    F.gravar(CHAVE_PEDIDO, pedido);
    $('#rgfEsperaTexto').textContent = pedido.tipo === 'liberacao'
      ? `Pedido para usar o RGF ${pedido.rgf} neste celular enviado.`
      : `Cadastro de ${pedido.nome} (RGF ${pedido.rgf}) enviado para aprovação.`;
    passoRgf('rgfEspera');
    if (pararRgf) pararRgf();
    pararRgf = await Db.observarRgf(pedido.rgf, st => {
      if (st.cache) return;
      if (st.meu && st.aprovado) { entrou({ rgf: pedido.rgf, nome: st.dados.nome, cargo: st.dados.cargo, papel: st.dados.papel || '' }); return; }
      const recusado = !st.existe || (pedido.tipo === 'liberacao' && !st.meu && st.dados.pedidoUid == null);
      if (recusado) {
        pararRgf();
        pararRgf = null;
        localStorage.removeItem(CHAVE_PEDIDO);
        $('#rgfAviso').textContent = 'O ADM não liberou o acesso. Fale com ele.';
        $('#rgfAviso').hidden = false;
        passoRgf('rgfPasso1');
      }
    });
  }

  function entrou(dados) {
    if (pararRgf) { pararRgf(); pararRgf = null; }
    localStorage.removeItem(CHAVE_PEDIDO);
    F.salvarPerfil({ rgf: dados.rgf, nome: dados.nome, cargo: dados.cargo, papel: dados.papel || '' });
    // FR de outro RGF que ficou neste celular continua sendo do dono (está no banco): sai daqui
    const fr = F.estado.fr;
    if (fr && fr.rgf && fr.rgf !== dados.rgf) { F.estado.fr = null; F.salvarAgora(); }
    F.usarConvidada(null);
    vigiarRgf();
    acompanharPreparadas();
    conferirChefe();
    F.reenviarLocais().catch(e => console.warn('[FR] reenviar locais', e.code || e));
    global.FrDia.inicio();
    recuperarFr();
  }

  // FR aberta deste RGF que está no banco (feita em outro celular, ou o ADM passou para ele):
  // o celular assume e continua de onde parou.
  async function recuperarFr() {
    const p = F.perfil();
    const local = F.estado.fr;
    if (!p || (local && local.status === 'aberta')) return;
    const r = await Db.frAbertaDoRgf(p.rgf);
    if (!r || !F.perfil() || F.perfil().rgf !== r.rgf || (F.estado.fr && F.estado.fr.status === 'aberta')) return;
    const u = await Db.usuario();
    if (r.uid !== u.uid) Db.assumirFr(r.id).catch(e => console.warn('[FR] assumir', e));
    F.estado.fr = F.paraLocal(r);
    F.salvarAgora();
    if (document.body.dataset.tela === 'inicio') global.FrDia.inicio();
    F.avisar(`FR de ${F.dataCurta(r.data)} recuperada. Continue de onde parou.`);
  }

  const millis = ts => (ts && ts.toMillis ? ts.toMillis() : 0);

  // Acompanha a FR aberta deste celular no banco: paradas registradas pelo colega com quem ela foi
  // compartilhada e troca de funcionário feita pelo ADM.
  let frObservada = null, pararFr = null;
  function acompanharFr() {
    const x = F.estado.fr;
    const id = x && x.status === 'aberta' ? x.id : null;
    if (id === frObservada) return;
    if (pararFr) { pararFr(); pararFr = null; }
    frObservada = id;
    if (!id) return;
    pararFr = Db.observarFr(id, (r, meta) => {
      const atual = F.estado.fr;
      if (!r || !atual || atual.id !== r.id || meta.hasPendingWrites) return;
      if (r.rgf && r.rgf !== atual.rgf) {
        F.estado.fr = null;
        F.salvarAgora();
        F.avisar(`A FR ${atual.placa || ''} foi passada para ${r.condutor}`.replace('  ', ' '));
        redesenharInicio();
        return;
      }
      // O chefe cancelou a FR
      if (r.status === 'cancelada' && atual.status === 'aberta') {
        F.estado.fr = null;
        F.salvarAgora();
        F.avisar(`${r.canceladaPor || 'O chefe'} cancelou a FR ${atual.placa || ''}`.trim());
        Db.excluirFr(r.id).catch(() => {}); // cancelada não fica guardada
        redesenharInicio();
        return;
      }
      // O ADM (ou o chefe) corrigiu a FR (ficha completa): vale a versão dele
      if (millis(r.editadoAdmEm) > (atual._editadoAdmEm || 0)) {
        F.estado.fr = F.paraLocal(r);
        F.salvarAgora();
        F.avisar(`${r.editadoPor || 'O ADM'} corrigiu a sua FR`);
        redesenharInicio();
        return;
      }
      // Km de saída corrigido em cadeia (a FR anterior do veículo tinha o km de retorno errado)
      const ck = r.correcaoKm;
      if (ck && ck.em > (atual._correcaoKmEm || 0)) {
        atual._correcaoKmEm = ck.em;
        if (F.aplicarCorrecaoKm(atual, ck.de, ck.para)) {
          F.sincronizar();
          F.avisar(`${ck.por || 'O ADM'} corrigiu o km de saída da sua FR para ${ck.para}`);
          redesenharInicio();
          return;
        }
        F.salvarAgora();
      }
      let mudou = false;
      const remoto = JSON.stringify(r.itinerario || []);
      const localJson = JSON.stringify(atual.itinerario || []);
      // Só aceita as paradas do banco se não houver parada nova deste celular esperando para subir
      if (remoto !== localJson && localJson === (atual._itinerarioEnviado || localJson)) {
        atual.itinerario = r.itinerario || [];
        atual._itinerarioEnviado = remoto;
        mudou = true;
      }
      const com = JSON.stringify(r.compartilhadoCom || []);
      if (com !== JSON.stringify(atual.compartilhadoCom || [])) {
        atual.compartilhadoCom = r.compartilhadoCom || [];
        atual.compartilhadoUids = r.compartilhadoUids || [];
        mudou = true;
      }
      if (mudou) { F.salvarAgora(); redesenharInicio(); }
    }, () => {
      // FR recém-criada ainda não chegou ao banco (ou sem permissão por enquanto): tenta de novo depois
      setTimeout(() => { if (frObservada === id) { pararFr = null; frObservada = null; } }, 5000);
    });
  }
  setInterval(acompanharFr, 1000);
  // Ao voltar para o app: FR que o ADM liberou de novo (ou passou para este funcionário)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recuperarFr(); });

  function redesenharInicio() {
    if (document.body.dataset.tela === 'inicio' && !document.querySelector('.folha:not([hidden])')) global.FrDia.inicio();
  }

  // FRs que colegas compartilharam com este celular
  let pararCompartilhadas = null;
  async function acompanharCompartilhadas() {
    if (pararCompartilhadas) return;
    pararCompartilhadas = await Db.observarCompartilhadas(lista => {
      const usando = F.convidada();
      F.listaCompartilhadas = lista;
      if (usando && !F.convidada()) {
        F.usarConvidada(null);
        F.avisar(`A FR de ${usando.condutor} não está mais compartilhada com você`);
        if (document.body.dataset.tela === 'inicio') global.FrDia.inicio();
        return;
      }
      redesenharInicio();
    });
  }

  // FRs que o chefe preparou para este funcionário
  let pararPreparadas = null, rgfPreparadas = null;
  function acompanharPreparadas() {
    const p = F.perfil();
    const rgf = p ? p.rgf : null;
    if (rgf === rgfPreparadas) return;
    if (pararPreparadas) { pararPreparadas(); pararPreparadas = null; }
    F.listaPreparadas = [];
    rgfPreparadas = rgf;
    if (!rgf) return;
    pararPreparadas = Db.observarPreparadas(rgf, lista => {
      F.listaPreparadas = lista;
      redesenharInicio();
    });
  }

  // Celular de chefe: registra no banco (uma vez por RGF) para poder ver as FRs da equipe
  const CHAVE_CHEFE = 'fr.chefe.v1';
  let chefePronto = Promise.resolve();
  function conferirChefe() {
    const p = F.perfil();
    const registrado = F.ler(CHAVE_CHEFE, null);
    if (p && p.papel === 'chefe') {
      if (registrado === p.rgf) return;
      chefePronto = Db.registrarChefe(p).then(() => F.gravar(CHAVE_CHEFE, p.rgf))
        .catch(e => console.warn('[FR] registrar chefe', e.code || e));
    } else if (registrado) {
      localStorage.removeItem(CHAVE_CHEFE);
      Db.deixarChefe();
    }
  }
  F.chefePronto = () => chefePronto;
  // O painel do chefe recebeu "sem permissão": registra o celular de novo
  F.registrarChefeDeNovo = () => { localStorage.removeItem(CHAVE_CHEFE); conferirChefe(); return chefePronto; };

  // Se o ADM desvincular este celular (ou liberar a troca de RGF), volta para o primeiro acesso.
  // Mudança de nome/cargo feita pelo ADM chega sozinha.
  async function vigiarRgf() {
    const p = F.perfil();
    if (!p) return;
    if (pararRgf) pararRgf();
    pararRgf = await Db.observarRgf(p.rgf, st => {
      if (st.cache) return;
      if (st.meu) {
        const papel = st.dados.papel || '';
        if (st.dados.nome !== p.nome || st.dados.cargo !== p.cargo || papel !== (p.papel || '')) {
          const virou = papel !== (p.papel || '');
          p.nome = st.dados.nome;
          p.cargo = st.dados.cargo;
          p.papel = papel;
          F.salvarPerfil(p);
          if (virou) {
            conferirChefe();
            if (['inicio', 'equipe', 'preparar'].includes(document.body.dataset.tela)) global.FrDia.inicio();
            F.avisar(papel === 'chefe' ? 'Você agora é chefe: veja as FRs da equipe' : 'Seu acesso de chefe foi retirado');
          }
        }
        return;
      }
      pararRgf();
      pararRgf = null;
      localStorage.removeItem('fr.perfil.v2');
      acompanharPreparadas();
      conferirChefe();
      // A FR aberta é do RGF que saiu deste celular: fica no banco para o dono continuar
      if (F.estado.fr && F.estado.fr.rgf === p.rgf) { F.estado.fr = null; F.salvarAgora(); }
      F.usarConvidada(null);
      $('#rgfNumero').value = '';
      telaRgf(st.existe ? 'O ADM liberou a troca. Digite o RGF que este celular vai usar.' : 'Seu cadastro foi removido pelo ADM.');
    });
  }

  // ---------- menu ----------
  $('#btnMenu').addEventListener('click', () => {
    const p = F.perfil();
    $('#menuQuem').innerHTML = p ? `<b>${F.escapar(p.nome)}</b><span>RGF ${F.escapar(p.rgf)} · ${F.escapar(p.cargo)}</span>` : '';
    $('#btnMenuFicha').hidden = !F.estado.fr || !!F.convidada() || document.body.dataset.tela === 'ficha';
    $('#btnMenuTrocarRgf').hidden = !p;
    $('#btnMenuAdm').textContent = document.body.dataset.tela === 'adm' ? 'Sair da área do ADM' : 'Área do ADM';
    F.abrirFolha('folhaMenu');
  });

  // Celular fraco ou quem prefere sem movimento: desliga as animações
  const rotuloAnim = () => { $('#btnAnimacoes').textContent = 'Animações: ' + (global.FrAnim.ligado() ? 'ligadas' : 'desligadas'); };
  rotuloAnim();
  $('#btnAnimacoes').addEventListener('click', () => {
    const lig = global.FrAnim.alternar();
    rotuloAnim();
    F.avisar(lig ? 'Animações ligadas' : 'Animações desligadas');
  });

  $('#btnMenuFicha').addEventListener('click', () => { F.fecharFolhas(); global.FrFicha.abrir(); });

  $('#btnMenuTrocarRgf').addEventListener('click', async () => {
    F.fecharFolhas();
    const p = F.perfil();
    if (!(await F.confirmar('Trocar o RGF?', `O ADM precisa liberar. Depois disso você digita o RGF certo neste celular. (RGF atual: ${p.rgf})`, 'Pedir ao ADM', false))) return;
    try { await Db.pedirLiberacao(p.rgf, 'trocar_rgf'); F.avisar('Pedido enviado ao ADM'); }
    catch (e) { F.avisar('Não foi possível enviar: ' + e.message, 'erro'); }
  });

  $('#btnMenuAdm').addEventListener('click', async () => {
    F.fecharFolhas();
    if (document.body.dataset.tela === 'adm') {
      global.FrAdm.fechar();
      await Db.sairAdm();
      F.perfil() ? global.FrDia.inicio() : telaRgf();
      return;
    }
    if (await Db.souAdm()) { global.FrAdm.abrir(); return; }
    F.abrirFolha('folhaAdmLogin');
    setTimeout(() => { const c = $('#admEmail'); if (c) c.focus(); }, 250);
  });

  $('#btnAdmEntrar').addEventListener('click', async () => {
    const btn = $('#btnAdmEntrar');
    btn.disabled = true;
    try {
      await Db.entrarAdm($('#admEmail').value.trim(), $('#admSenha').value);
      $('#admSenha').value = '';
      F.fecharFolhas();
      global.FrAdm.abrir();
    } catch (e) {
      F.avisar(/password|user-not-found|credential/i.test(e.code || e.message) ? 'E-mail ou senha incorretos' : e.message, 'erro');
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- atualizador do APK ----------
  const atualizador = F.plugin('AppUpdater');
  if (atualizador) {
    $('#btnAtualizar').hidden = false;
    $('#btnAtualizar').addEventListener('click', async () => {
      F.fecharFolhas();
      try {
        const r = await atualizador.check({ interactive: true });
        if (r && r.status === 'up-to-date') F.avisar('O app já está na versão mais recente');
      } catch (e) { F.avisar('Não foi possível verificar: ' + e.message, 'erro'); }
    });
    atualizador.getInfo().then(i => { $('#versao').textContent = 'Versão ' + i.versionName; }).catch(() => {});
  } else {
    $('#versao').textContent = global.FR_CONFIG.EMULADOR ? 'Versão de teste (banco local)' : 'Versão web ' + global.FR_VERSAO;
  }

  // ---------- site instalado no celular (PWA) ----------
  // O sw.js guarda o app inteiro no celular: depois da primeira visita abre sem internet.
  if (!F.nativo && 'serviceWorker' in navigator && !global.FR_CONFIG.EMULADOR) {
    const tinhaSw = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      $('#btnAtualizar').hidden = false;
      $('#btnAtualizar').addEventListener('click', async () => {
        F.fecharFolhas();
        try {
          await reg.update();
          if (!reg.installing && !reg.waiting) F.avisar('O app já está na versão mais recente');
          else F.avisar('Baixando a versão nova…');
        } catch (e) { F.avisar('Sem internet para procurar atualização', 'erro'); }
      });
    }).catch(e => console.warn('[FR] service worker', e));

    // Versão nova instalada: recarrega na hora se o app estiver em segundo plano,
    // senão na próxima vez que o funcionário voltar para ele (não atrapalha quem está digitando).
    let recarregar = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!tinhaSw) return;
      F.salvarAgora();
      if (document.hidden) location.reload();
      else { recarregar = true; F.avisar('Versão nova pronta. Ela abre na próxima vez.'); }
    });
    document.addEventListener('visibilitychange', () => {
      if (recarregar && document.hidden) { F.salvarAgora(); location.reload(); }
    });

    let pedidoInstalar = null;
    global.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      pedidoInstalar = e;
      $('#btnInstalar').hidden = false;
    });
    global.addEventListener('appinstalled', () => { pedidoInstalar = null; $('#btnInstalar').hidden = true; });
    $('#btnInstalar').addEventListener('click', async () => {
      F.fecharFolhas();
      if (!pedidoInstalar) return;
      pedidoInstalar.prompt();
      await pedidoInstalar.userChoice.catch(() => null);
      pedidoInstalar = null;
      $('#btnInstalar').hidden = true;
    });
  }

  // ---------- início ----------
  // Abre na hora com o que está no celular (funcionário, FR e veículos). O login do Firebase
  // confere o usuário no servidor ao abrir e, com sinal fraco, só desiste depois de 30 s:
  // por isso nada da tela espera por ele. As gravações ficam na fila até ele terminar.
  async function iniciar() {
    F.mostrarTela('carregando');
    global.FrPdf.carregar().catch(e => F.avisar(e.message, 'erro'));
    F.veiculos = F.ler(CHAVE_VEICULOS, []);
    F.locais = F.ler(CHAVE_LOCAIS, []);
    Db.observarLocais(lista => {
      F.locais = lista;
      F.gravar(CHAVE_LOCAIS, F.locais);
    });
    Db.observarVeiculos(lista => {
      F.veiculos = lista;
      F.gravar(CHAVE_VEICULOS, lista);
      redesenharInicio();
    });
    acompanharCompartilhadas();
    if (!F.perfil()) { telaRgf(); return; }
    vigiarRgf();
    acompanharPreparadas();
    conferirChefe();
    F.reenviarLocais().catch(e => console.warn('[FR] reenviar locais', e.code || e));
    global.FrDia.inicio();
    recuperarFr();
  }

  iniciar().catch(e => { console.error('[FR] iniciar', e); F.avisar('Erro ao abrir: ' + e.message, 'erro'); });
})(window);
