// FR - painel do chefe: FRs da equipe (hoje e em aberto), preparar FR para um funcionário,
// passar, cancelar, corrigir, imprimir as FRs do dia e dar baixa nas FRs feitas no papel.
// O chefe também dirige: "Meu dia" (dia.js) e "Equipe" (aqui) se alternam no topo do início.

(function (global) {
  const F = global.FR;
  const L = global.FrLista;
  const Db = global.FrDb;
  const { $, $$, escapar } = F;

  let equipe = [];
  let frs = [];
  let carregado = false;
  let pararEquipe = null, pararPainel = null;
  let tentouRegistrar = false;
  let anteriores = null; // { lista, ultimo, fim } quando o chefe abre "Dias anteriores"
  const fechando = new Set();

  const eu = () => F.perfil() || {};
  const quem = () => ({ rgf: eu().rgf, nome: eu().nome });
  const primeiroNome = n => (n || '').trim().split(/\s+/)[0] || '';
  const iniciais = n => (n || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).filter((c, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();
  const veiculo = id => (F.veiculos || []).find(v => v.id === id) || null;
  const funcionario = rgf => equipe.find(f => f.rgf === rgf) || null;
  // O chefe não usa o app para dirigir: a FR que ele prepara para si mesmo vai no papel
  const usaApp = f => !!(f && f.uid && f.aprovado && f.rgf !== (F.perfil() || {}).rgf);
  const nomeVeiculo = x => [x.marca, x.modelo].filter(Boolean).join(' ') || 'Veículo';
  function saudacao() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

  function kmAgora(x) {
    const it = x.itinerario || [];
    for (let i = it.length - 1; i >= 0; i--) { if (it[i].chegada_km) return it[i].chegada_km; if (it[i].saida_km) return it[i].saida_km; }
    return x.partida_km || '';
  }
  function rodado(x) {
    const m = F.medidor(x);
    const a = m.ler(x.partida_km), b = m.ler(x.retorno_km || kmAgora(x));
    return a != null && b != null ? `${m.texto(b - a)} ${m.un}` : '';
  }

  // ---------- dados ao vivo ----------
  async function ligar() {
    if (pararPainel) return;
    await F.chefePronto();
    if (!F.ehChefe() || pararPainel) return;
    pararEquipe = Db.observarEquipe(l => { equipe = l; redesenhar(); }, semPermissao);
    pararPainel = Db.observarPainel(F.hoje(), (lista, cache) => {
      frs = lista.filter(f => f.status !== 'cancelada'); // cancelada não aparece (e é apagada)
      carregado = true;
      if (!cache) fecharAntigas();
      redesenhar();
    }, semPermissao);
    limpar();
  }
  function desligar() {
    if (pararEquipe) { pararEquipe(); pararEquipe = null; }
    if (pararPainel) { pararPainel(); pararPainel = null; }
  }
  // Celular ainda não registrado como chefe (ou o registro sumiu): registra de novo uma vez
  function semPermissao(e) {
    if (e.code !== 'permission-denied' || tentouRegistrar) return;
    tentouRegistrar = true;
    desligar();
    F.registrarChefeDeNovo().then(() => { if (document.body.dataset.tela === 'equipe') ligar(); });
  }
  const dia = { hoje: F.hoje() };
  // Virou o dia com o app aberto: as consultas de "hoje" mudam
  setInterval(() => {
    if (dia.hoje !== F.hoje()) { dia.hoje = F.hoje(); desligar(); if (document.body.dataset.tela === 'equipe') ligar(); }
  }, 60000);

  // FR preparada de dia anterior que ninguém encerrou (papel não voltou): fecha sozinha
  function fecharAntigas() {
    const velhas = frs.filter(f => f.status === 'preparada' && f.data < F.hoje() && !fechando.has(f.id));
    if (!velhas.length) return;
    velhas.forEach(f => fechando.add(f.id));
    Db.fecharAntigas(velhas).catch(e => console.warn('[chefe] fechar antigas', e.code || e));
  }
  // Uma vez por dia: FRs encerradas/canceladas abertas há mais de 30 dias saem do banco
  function limpar() {
    if (F.ler('fr.limpeza.v2', '') === F.hoje()) return;
    F.gravar('fr.limpeza.v2', F.hoje());
    Db.limparAntigas().then(n => { if (n) console.info('[chefe] FRs antigas apagadas:', n); })
      .catch(e => console.warn('[chefe] limpeza', e.code || e));
  }

  function redesenhar() {
    const tela = document.body.dataset.tela;
    if (tela === 'equipe') desenhar(); // as folhas abertas ficam por cima e não mudam
    // No passo a passo só redesenha se a lista ainda estava carregando (não atrapalha a busca)
    if (tela === 'preparar' && passo === 1 && !$('#ppEquipe [data-func]')) desenharPasso();
  }

  // ---------- painel ----------
  function abrir() {
    ligar();
    F.mostrarTela('equipe');
    desenhar();
  }

  const emAberto = () => frs.filter(f => f.status === 'aberta' || f.status === 'preparada')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'preparada' ? -1 : 1) || (a.partida_hora || '').localeCompare(b.partida_hora || ''));
  const finalizadasHoje = () => frs.filter(f => f.status === 'fechada' && f.data === F.hoje())
    .sort((a, b) => (b.retorno_hora || '').localeCompare(a.retorno_hora || ''));
  // O chefe só imprime/abre a FR encerrada ou a do papel; a que está em serviço no app é só do funcionário (e do ADM)
  const doPapel = f => f.status === 'preparada' && !usaApp(funcionario(f.rgf));
  const liberada = f => f.status === 'fechada' || doPapel(f);
  const doDia = () => frs.filter(f => f.data === F.hoje() && liberada(f));

  function situacao(f) {
    const m = F.medidor(f);
    if (f.status === 'aberta') {
      // Só a saída (horário e km): o andamento do dia fica com o funcionário e o ADM
      const k = m.ler(f.partida_km);
      return { classe: 'servico', status: 'Em serviço', detalhe: `Saída ${f.partida_hora || '--:--'}`, km: k != null ? `${m.grande(k)} ${m.un}` : '' };
    }
    const fu = funcionario(f.rgf);
    const v = veiculo(f.veiculoId);
    const k = m.ler(f.partida_km) != null ? m.ler(f.partida_km) : v && v.ultimoKm != null ? v.ultimoKm : null;
    const futura = f.data > F.hoje();
    return {
      classe: usaApp(fu) ? 'aguardando' : 'papel',
      status: futura ? `Para ${F.dataCurta(f.data)}` : usaApp(fu) ? `Aguardando ${primeiroNome(f.condutor)}` : 'No papel',
      detalhe: f.data < F.hoje() ? `De ${F.dataCurta(f.data)} · fecha sozinha` : m.ler(f.partida_km) != null ? 'Km de saída' : 'Último registro',
      km: k != null ? `${m.grande(k)} ${m.un}` : '',
    };
  }

  function seloImpressa(f) {
    return f.impressaEm ? '<span class="selo selo-ok">Impressa</span>' : '<span class="selo">Não impressa</span>';
  }

  function avisoSemDescricao(f) {
    const l = F.defeitosSemDescricao(f);
    return l.length ? `<p class="txt-aviso aviso-cartao">X sem descrição: ${escapar(l.join(', '))}. Confira com ${escapar(primeiroNome(f.condutor))}.</p>` : '';
  }

  // Cartões e papel ao lado: mesmas peças do ADM (frlista.js)
  function cartaoAberto(f) {
    const s = situacao(f);
    const minha = !!f.preparadaPor;
    const origem = minha ? `preparada por ${f.preparadaPor.rgf === eu().rgf ? 'você' : primeiroNome(f.preparadaPor.nome)}` : 'começou no app';
    // Na ordem de importância: o que não couber vai para o "⋯ Mais"
    const acoes = [];
    if (f.status === 'preparada') acoes.push(['papel', 'Recebi papel']);
    if (liberada(f)) acoes.push(['pdf', 'Ver PDF'], ['imprimir', 'Imprimir']);
    if (minha && f.status === 'preparada') acoes.push(['editar', 'Editar']);
    if (minha) acoes.push(['passar', 'Passar']);
    if (minha) acoes.push(['cancelar', 'Cancelar', 'perigo']);
    return L.cartao({ f, titulo: f.condutor || '', sub: `${nomeVeiculo(f)} · ${origem}`, status: s.status, classe: s.classe, detalhe: s.detalhe, km: s.km,
      selo: f.impressaEm ? '<span class="selo selo-ok">Impressa</span>' : '', acoes });
  }

  function cartaoFinal(f, comData) {
    const minha = !!f.preparadaPor;
    const r = rodado(f);
    const status = f.fechadaAuto ? 'Fechou sozinha' : f.recebidaPor ? 'Papel recebido' : f.retorno_hora ? `Encerrada às ${f.retorno_hora}` : 'Encerrada';
    const acoes = [['pdf', 'Ver PDF'], ['imprimir', 'Imprimir'], ['editar', 'Editar']];
    if (minha && (f.fechadaAuto || f.recebidaPor)) acoes.push(['papel', 'Anotar km']);
    if (usaApp(funcionario(f.rgf))) acoes.push(['liberar', 'Reabrir']);
    return L.cartao({ f, titulo: (comData ? F.dataCurta(f.data) + ' · ' : '') + (f.condutor || ''), sub: nomeVeiculo(f), status, classe: 'final',
      detalhe: [f.partida_hora && f.retorno_hora ? `${f.partida_hora} às ${f.retorno_hora}` : '', r ? `${r} rodados` : ''].filter(Boolean).join(' · '),
      km: '', selo: seloImpressa(f), acoes, aviso: avisoSemDescricao(f) });
  }

  let filtro = 'todas';

  function desenhar() {
    const caixa = $('#equipe');
    if (anteriores) { desenharAnteriores(caixa); return; }
    if (document.body.dataset.tela === 'equipe') $('#btnVoltar').hidden = true;
    const abertas = emAberto(), finais = finalizadasHoje();
    const naoImpressas = doDia().filter(f => !f.impressaEm);
    const chip = (id, rotulo, n, alerta) => `<button type="button" class="filtro${filtro === id ? ' ativo' : ''}${alerta && n ? ' filtro-alerta' : ''}" data-filtro="${id}">${rotulo}${n != null ? ` <b>${n}</b>` : ''}</button>`;
    let html = `<div class="ola"><h2>${saudacao()}, ${escapar(primeiroNome(eu().nome))}</h2><p>${escapar(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p></div>
      <div class="barra-chefe">
        <button type="button" class="btn btn-principal" id="btnPreparar">${F.ic('mais')}Preparar FR</button>
        <button type="button" class="btn btn-claro" id="btnImprimirDia">${F.ic('imprimir')}Imprimir do dia</button>
        <button type="button" class="btn btn-claro" id="btnAnteriores">${F.ic('calendario')}Dias anteriores</button>
        ${global.FrBackup && global.FrBackup.suportado ? `<button type="button" class="btn btn-claro" id="btnConfigImpressao" title="Impressão e backup">${F.ic('backup')}Backup</button>` : ''}
      </div>
      <div class="filtros">${chip('todas', 'Todas')}${chip('abertas', 'Em aberto', abertas.length)}${chip('finais', 'Finalizadas', finais.length)}${chip('naoimp', 'Não impressas', naoImpressas.length, true)}</div>`;
    if (!carregado) html += '<div class="vazio"><div class="girando"></div><p>Carregando as FRs da equipe…</p></div>';
    else {
      const card = f => (f.status === 'aberta' || f.status === 'preparada') ? cartaoAberto(f) : cartaoFinal(f);
      let lista = '';
      if (filtro === 'naoimp') {
        lista = `<h3 class="secao">Não impressas</h3>` + (naoImpressas.length ? naoImpressas.map(card).join('') : '<p class="dica">Todas as FRs de hoje já foram impressas.</p>');
      } else {
        if (filtro !== 'finais') lista += `<h3 class="secao">Em aberto</h3>` + (abertas.length ? abertas.map(cartaoAberto).join('')
          : '<p class="dica">Nenhuma FR em aberto. Toque em "Preparar FR" para montar a de um funcionário.</p>');
        if (filtro !== 'abertas') lista += `<h3 class="secao">Finalizadas hoje</h3>` + (finais.length ? finais.map(f => cartaoFinal(f)).join('')
          : '<p class="dica">Nenhuma FR encerrada hoje ainda.</p>');
      }
      html += L.painel(lista);
    }
    caixa.innerHTML = html;
    $$('[data-filtro]', caixa).forEach(b => b.addEventListener('click', () => {
      filtro = filtro === b.dataset.filtro ? 'todas' : b.dataset.filtro;
      desenhar();
    }));
    $('#btnPreparar').addEventListener('click', preparar);
    $('#btnImprimirDia').addEventListener('click', folhaImprimirDia);
    $('#btnAnteriores').addEventListener('click', abrirAnteriores);
    const cfg = $('#btnConfigImpressao');
    if (cfg) cfg.addEventListener('click', configImpressao);
    ligarAcoes(caixa, frs);
  }

  function ligarAcoes(caixa, lista) {
    L.ligar(caixa, lista, {
      acoes: { editar, passar, cancelar, papel: receberPapel, imprimir, pdf: verPdf, liberar },
      // O chefe não vê a FR que está em serviço no app do funcionário
      podeVer: liberada,
      bloqueada: f => `FR em serviço no celular de ${primeiroNome(f.condutor)}. O papel fica disponível quando ele encerrar.`,
      imprimir, verPdf,
    });
  }

  // ---------- ações de uma FR ----------
  const erro = e => F.avisar('Não foi possível: ' + (e.code === 'permission-denied' ? 'sem permissão' : e.message || e), 'erro');
  const marcarImpressas = lista => Db.marcarImpressas(lista.map(f => f.id), eu().nome).catch(() => {});

  // Imprimir vai direto para a impressão (a cópia de backup é feita na hora de imprimir)
  function imprimir(f) {
    F.imprimirVarias([f], marcarImpressas).catch(erro);
  }
  // Ver a FR (visor com zoom) com os botões de sempre; Editar quando o chefe pode mexer
  function verPdf(f) {
    const podeEditar = f.status === 'fechada' || (f.status === 'preparada' && f.preparadaPor);
    F.verPdf(f, { aoImprimir: marcarImpressas, editar: podeEditar && (() => editar(f)) });
  }

  // FR encerrada sem querer: volta a ficar em serviço e o celular do funcionário pega de novo
  async function liberar(f) {
    if (!(await F.confirmar('Liberar a FR de novo?', `A FR de ${f.condutor} (${nomeVeiculo(f)}) volta a ficar em serviço e aparece de novo no celular dele para continuar e encerrar.`, 'Liberar', false))) return;
    Db.reabrirFrChefe(f.id).then(() => F.avisar('FR liberada')).catch(erro);
  }

  async function cancelar(f) {
    const txt = f.status === 'aberta'
      ? `A FR de ${f.condutor} (${nomeVeiculo(f)}) está em serviço. Ela some do celular dele e do sistema, e o veículo continua com o km de antes.`
      : `A FR de ${f.condutor} (${nomeVeiculo(f)}) será apagada.`;
    if (!(await F.confirmar('Cancelar a FR?', txt, 'Cancelar a FR'))) return;
    Db.cancelarFrChefe(f, eu().nome).then(() => F.avisar('FR cancelada')).catch(erro);
  }

  // Funcionários que podem receber uma FR (escolha em lista, com busca)
  function escolhaEquipe(excluir) {
    return equipe.filter(x => x.aprovado && x.rgf !== excluir).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }

  function passar(f) {
    const lista = escolhaEquipe(f.rgf);
    F.folhaForm({
      titulo: 'Passar a FR',
      botao: 'Passar a FR',
      html: `<p class="dica">FR de ${escapar(nomeVeiculo(f))} ${f.placa ? escapar(f.placa) : ''}, hoje com <b>${escapar(f.condutor)}</b>. Para quem ela vai?</p>
        ${lista.length ? `<div class="chips chips-quebra">${lista.map(x => `<button type="button" class="chip" data-escolha="${escapar(x.rgf)}">${escapar(x.nome)}</button>`).join('')}</div>` : '<p class="aviso">Ninguém mais na equipe.</p>'}`,
      aoAbrir: corpo => $$('[data-escolha]', corpo).forEach(c => c.addEventListener('click', () => {
        $$('[data-escolha]', corpo).forEach(o => o.classList.toggle('ativo', o === c));
      })),
      aoOk: async corpo => {
        const c = $('[data-escolha].ativo', corpo);
        const novo = c && funcionario(c.dataset.escolha);
        if (!novo) { F.avisar('Escolha o funcionário', 'erro'); return false; }
        try { await Db.passarFr(f.id, novo, quem()); F.avisar(`FR passada para ${primeiroNome(novo.nome)}`); }
        catch (e) { erro(e); return false; }
      },
    });
  }

  // Corrige na ficha completa (a mesma do funcionário); grava ao voltar
  function editar(f) {
    global.FrFicha.editarFr(f, { salvar: (x, antes) => Db.salvarFrChefe(x, eu().nome, veiculo(x.veiculoId), antes), voltar: abrir });
  }

  // A FR feita no papel voltou: o chefe anota o km (para o próximo dia sair certo) e ela encerra
  function receberPapel(f) {
    const m = F.medidor(f);
    const v = veiculo(f.veiculoId);
    const saida = f.partida_km || f.kmEsperado || '';
    F.folhaForm({
      titulo: f.status === 'preparada' ? 'Recebi o papel' : 'Anotar km',
      botao: f.status === 'preparada' ? 'Encerrar a FR' : 'Salvar',
      // Do papel só interessa o km de retorno: o resto já veio na preparação
      html: `<div class="papel-veiculo">${F.placaHtml(f)}<span class="frota-nome"><b>${escapar(nomeVeiculo(f))}</b><small>${escapar(f.condutor || '')} · ${escapar(F.dataCurta(f.data))}</small></span></div>
        ${saida ? `<p class="papel-saida"><span>Saída</span><b>${escapar(saida)} ${m.un}</b></p>` : ''}
        <label class="campo"><span>${m.Nome} de retorno (do papel)</span><input id="rpRetorno" class="campo-grande" inputmode="${m.teclado}" autocomplete="off" value="${escapar(f.retorno_km || '')}"></label>
        <p class="dica">Confira com o papel e salve. O veículo fica com este ${m.nome} e a próxima FR já sai com ele.</p>`,
      aoAbrir: () => setTimeout(() => { const c = $('#rpRetorno'); if (c) c.focus(); }, 250),
      aoOk: async () => {
        const dados = { partida_km: saida, retorno_km: $('#rpRetorno').value.trim() };
        if (!dados.retorno_km) { F.avisar(`Digite o ${m.nome} de retorno`, 'erro'); return false; }
        const a = m.ler(dados.partida_km), b = m.ler(dados.retorno_km);
        if (a != null && b != null && b < a && !(await F.confirmar(`Conferir o ${m.nome}`, `O retorno (${m.texto(b)}) é menor que a saída (${m.texto(a)}). Está certo?`, 'Está certo', false))) return false;
        if (a != null && b != null && b - a > (m.horimetro ? 24 : 800) && !(await F.confirmar(`Conferir o ${m.nome}`, `Foram ${m.texto(b - a)} ${m.un} no dia. Está certo?`, 'Está certo', false))) return false;
        if (v && b != null && v.ultimoKm != null && b < v.ultimoKm) F.avisar(`O veículo já tem ${m.texto(v.ultimoKm)} ${m.un} registrado: ele fica com esse`);
        try {
          const msg = await Db.receberPapel(f, dados, v, eu().nome);
          const eraAberta = f.status === 'preparada';
          Object.assign(f, dados, { status: 'fechada', recebidaPor: eu().nome });
          F.avisar(eraAberta ? 'FR encerrada' : msg);
          if (anteriores) desenhar();
        } catch (e) { erro(e); return false; }
      },
    });
  }

  // ---------- imprimir as FRs do dia ----------
  function folhaImprimirDia() {
    const lista = doDia().sort((a, b) => (a.condutor || '').localeCompare(b.condutor || ''));
    if (!lista.length) { F.avisar('Nenhuma FR hoje ainda'); return; }
    const marcadas = new Set(lista.filter(f => !f.impressaEm).map(f => f.id));
    const botao = () => { const n = marcadas.size; return n ? `Imprimir ${n} ${n === 1 ? 'FR' : 'FRs'}` : 'Marque as FRs'; };
    F.folhaForm({
      titulo: 'Imprimir FRs do dia',
      botao: botao(),
      html: `<p class="dica">As já impressas ficam desmarcadas. Cada FR sai em uma folha, frente e verso${global.FrBackup && global.FrBackup.suportado ? ', e uma cópia vai para a pasta de backup' : ''}.</p>
        <div class="lista-marcar">${lista.map(f => `<button type="button" class="opcao-marcar ${marcadas.has(f.id) ? 'on' : ''}" data-marcar="${escapar(f.id)}">
          <span class="caixinha"></span><span class="frota-nome"><b>${escapar(f.condutor)}</b><small>${escapar([nomeVeiculo(f), f.placa, f.status === 'aberta' ? 'em serviço' : f.status === 'preparada' ? 'no papel' : rodado(f)].filter(Boolean).join(' · '))}</small></span>
          ${f.impressaEm ? '<span class="selo selo-ok">Já impressa</span>' : '<span class="selo">Não impressa</span>'}</button>`).join('')}</div>`,
      aoAbrir: corpo => $$('[data-marcar]', corpo).forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.marcar;
        if (marcadas.has(id)) marcadas.delete(id); else marcadas.add(id);
        b.classList.toggle('on', marcadas.has(id));
        $('#folhaFormOk').textContent = botao();
      })),
      aoOk: async () => {
        const escolhidas = lista.filter(f => marcadas.has(f.id));
        if (!escolhidas.length) { F.avisar('Marque as FRs para imprimir', 'erro'); return false; }
        F.fecharFolha('folhaForm');
        try { await F.imprimirVarias(escolhidas, marcarImpressas); }
        catch (e) { F.avisar('Não foi possível imprimir: ' + e.message, 'erro'); }
      },
    });
  }

  // ---------- dias anteriores ----------
  async function abrirAnteriores() {
    anteriores = { lista: [], ultimo: null, fim: false, carregando: true };
    desenhar();
    if (F.armarVoltar) F.armarVoltar();
    await carregarMais();
  }
  async function carregarMais() {
    anteriores.carregando = true;
    await F.chefePronto(); // o celular precisa estar registrado como chefe para ler as FRs
    try {
      const r = await Db.frsAnteriores(F.hoje(), anteriores.ultimo);
      if (!anteriores) return;
      anteriores.lista = anteriores.lista.concat(r.lista.filter(f => f.status !== 'cancelada'));
      anteriores.ultimo = r.ultimo;
      anteriores.fim = r.lista.length < 40;
    } catch (e) { erro(e); }
    if (!anteriores) return;
    anteriores.carregando = false;
    desenhar();
  }
  function desenharAnteriores(caixa) {
    const a = anteriores;
    const grupos = {};
    a.lista.forEach(f => { (grupos[f.data] = grupos[f.data] || []).push(f); });
    // O voltar é o botão do topo, como nas outras telas
    $('#btnVoltar').hidden = false;
    let html = `<h2 class="titulo-tela">Dias anteriores</h2>
      <p class="dica">As FRs ficam no sistema por 30 dias depois de abertas. As preparadas que não voltaram fecharam sozinhas: use "Anotar km" quando o papel chegar.</p>`;
    let lista = '';
    Object.keys(grupos).sort().reverse().forEach(d => {
      lista += `<h3 class="secao">${escapar(new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }))}</h3>
        ${grupos[d].sort((x, y) => (x.condutor || '').localeCompare(y.condutor || '')).map(f => (f.status === 'aberta' || f.status === 'preparada') ? cartaoAberto(f) : cartaoFinal(f)).join('')}`;
    });
    if (a.carregando) lista += '<div class="vazio"><div class="girando"></div></div>';
    else if (!a.lista.length) lista += '<div class="vazio"><p>Nenhuma FR nos dias anteriores.</p></div>';
    else if (!a.fim) lista += '<button type="button" class="btn btn-claro" id="btnMaisAnteriores">Carregar mais</button>';
    caixa.innerHTML = html + L.painel(lista);
    const mais = $('#btnMaisAnteriores');
    if (mais) mais.addEventListener('click', carregarMais);
    ligarAcoes(caixa, a.lista);
  }

  // ---------- impressão e backup (computador) ----------
  async function configImpressao() {
    const B = global.FrBackup;
    const h = await B.pasta();
    const ok = h && await B.liberada(false);
    F.folhaForm({
      titulo: 'Impressão e backup',
      botao: 'Fechar',
      semCancelar: true,
      html: `<h3 class="secao">Pasta de backup das FRs</h3>
        <p class="dica">${h ? `Pasta: <b>${escapar(h.name)}</b> › ano-mês › FR_NOME_DATA.pdf${ok ? '' : '<br><span class="txt-aviso">O navegador precisa da sua licença de novo: toque em "Liberar".</span>'}`
          : 'Nenhuma pasta escolhida. Escolha uma pasta (ex.: Documentos › FR-Backup) e cada FR impressa neste computador ganha uma cópia lá, separada por mês.'}</p>
        <div class="acoes">
          <button type="button" class="link" id="cfgPasta">${h ? 'Trocar pasta' : 'Escolher pasta'}</button>
          ${h && !ok ? '<button type="button" class="link" id="cfgLiberar">Liberar</button>' : ''}
          ${h ? '<button type="button" class="link link-perigo" id="cfgEsquecer">Parar o backup</button>' : ''}
        </div>
        <p class="dica">O sistema guarda as FRs por 30 dias. As cópias desta pasta ficam para sempre.</p>
        <h3 class="secao">Impressora: frente e verso sem perguntar</h3>
        <ol class="guia">
          <li>No Windows, abra <b>Configurações › Impressoras</b>, escolha a impressora e deixe como <b>padrão</b>.</li>
          <li>Em <b>Preferências de impressão</b>, marque <b>Frente e verso › Virar na borda longa</b> e papel <b>A4</b>.</li>
          <li>Crie um atalho do Chrome na área de trabalho e, em <b>Propriedades › Destino</b>, acrescente no fim:<br><code>--kiosk-printing</code></li>
          <li>Abra o FR por esse atalho: "Imprimir" vai direto para a impressora, já em frente e verso.</li>
        </ol>
        <p class="dica">Sem o atalho, na tela de impressão escolha: <b>Mais definições › Imprimir dos dois lados</b> (borda longa).</p>`,
      aoAbrir: corpo => {
        const refazer = () => { F.fecharFolha('folhaForm'); setTimeout(configImpressao, 50); };
        $('#cfgPasta', corpo).addEventListener('click', async () => {
          try { await B.escolher(); F.avisar('Pasta de backup escolhida'); refazer(); }
          catch (e) { if (e.name !== 'AbortError') F.avisar('Não foi possível usar essa pasta', 'erro'); }
        });
        const lib = $('#cfgLiberar', corpo);
        if (lib) lib.addEventListener('click', async () => { if (await B.liberada(true)) refazer(); });
        const esq = $('#cfgEsquecer', corpo);
        if (esq) esq.addEventListener('click', async () => { await B.esquecer(); F.avisar('Backup desligado'); refazer(); });
      },
      aoOk: () => {},
    });
  }

  // =====================================================================
  // Preparar FR (passo a passo)
  // =====================================================================
  const PASSOS = ['Funcionário', 'Veículo', 'Serviço'];
  let passo = 1;
  let rascunho = null;

  function preparar() {
    rascunho = { rgf: null, veiculoId: undefined, descricao: '', data: F.hoje(), km: '' };
    passo = 1;
    busca = '';
    F.mostrarTela('preparar');
    desenharPasso();
  }
  let busca = '';

  // Quem já está com FR (aberta ou preparada) hoje, e quais veículos estão em uso
  const ocupacao = () => frs.filter(f => (f.status === 'aberta' || f.status === 'preparada') && f.data <= rascunho.data);

  function desenharPasso() {
    $('#prepararPassos').innerHTML = PASSOS.map((n, i) =>
      `<span class="${i + 1 < passo ? 'feito' : i + 1 === passo ? 'atual' : ''}">${i + 1}. ${n}</span>`).join('');
    $('#btnPrepararVoltar').textContent = passo === 1 ? 'Cancelar' : 'Voltar';
    $('#btnPrepararAvancar').hidden = passo < 3;
    // Quem usa o app recebe a FR no celular: o chefe não imprime antes de ela ser encerrada
    const app = usaApp(funcionario(rascunho.rgf));
    $('#btnPrepararSo').hidden = passo !== 3 || app;
    $('#btnPrepararAvancar').textContent = app ? 'Salvar e enviar' : 'Salvar e imprimir';
    $('#prepararRodape').classList.toggle('tres', passo === 3 && !app);
    [null, passoFuncionario, passoVeiculo, passoServico][passo]($('#preparar'));
    previa();
  }

  function passoFuncionario(caixa) {
    caixa.innerHTML = `<h2 class="titulo-tela">Para quem é a FR?</h2>
      <label class="campo"><input id="ppBusca" placeholder="Buscar funcionário (nome ou RGF)" value="${escapar(busca)}"></label>
      <div class="lista-veiculos" id="ppEquipe"></div>`;
    const desenharLista = () => {
      const q = F.chaveLocal(busca);
      const ocup = ocupacao();
      const lista = escolhaEquipe(null).filter(x => !q || F.chaveLocal(x.nome).includes(q) || String(x.rgf).includes(q));
      $('#ppEquipe').innerHTML = lista.length ? lista.map(x => {
        const fr = ocup.find(f => f.rgf === x.rgf);
        const selo = fr ? (fr.status === 'aberta' ? ['', 'Já tem FR aberta'] : ['', 'Já tem FR preparada'])
          : usaApp(x) ? ['selo-ok', 'Usa o app'] : ['selo-papel', 'Só papel'];
        return `<button type="button" class="veiculo ${fr ? 'off' : ''}" data-func="${escapar(x.rgf)}">
          <span class="avatar">${escapar(iniciais(x.nome))}</span>
          <span class="veiculo-info"><b>${escapar(x.nome)}</b><small>RGF ${escapar(x.rgf)} · ${escapar(x.cargo || '')}</small>
            <span class="selo ${selo[0]}">${selo[1]}</span></span></button>`;
      }).join('') : `<p class="dica">${equipe.length ? 'Ninguém com esse nome.' : 'Carregando a equipe…'}</p>`;
    };
    desenharLista();
    $('#ppBusca').addEventListener('input', e => { busca = e.target.value; desenharLista(); });
    $('#ppEquipe').addEventListener('click', async e => {
      const b = e.target.closest('[data-func]');
      if (!b) return;
      if (b.classList.contains('off')) {
        const fr = ocupacao().find(f => f.rgf === b.dataset.func);
        if (!(await F.confirmar('Já tem FR', `${fr.condutor} já tem uma FR ${fr.status === 'aberta' ? 'aberta' : 'preparada'} (${nomeVeiculo(fr)}). Preparar outra mesmo assim?`, 'Preparar outra', false))) return;
      }
      rascunho.rgf = b.dataset.func;
      passo = 2;
      desenharPasso();
    });
  }

  function passoVeiculo(caixa) {
    const f = funcionario(rascunho.rgf) || {};
    const lista = F.veiculos || [];
    caixa.innerHTML = `<h2 class="titulo-tela">Qual veículo?</h2><p class="dica">FR de ${escapar(primeiroNome(f.nome))}</p>
      ${lista.length > 6 ? '<label class="campo"><input id="ppBuscaV" placeholder="Buscar por placa, modelo ou tombamento" autocomplete="off"></label>' : ''}
      <div class="lista-veiculos" id="ppVeiculos"></div>
      <button type="button" class="btn btn-texto" id="ppSemVeiculo">Veículo fora da lista (preencher no papel)</button>`;
    const desenharLista = filtro => {
      const q = (filtro || '').toLowerCase();
      const ocup = ocupacao();
      $('#ppVeiculos').innerHTML = lista.filter(v => !q || [v.placa, v.modelo, v.marca, v.tombamento].join(' ').toLowerCase().includes(q)).map(v => {
        const m = F.medidor(v);
        const uso = ocup.find(x => x.veiculoId === v.id);
        const lic = F.alertaLicenciamento(v);
        const rev = global.FrDia.alertaRevisao(v);
        const def = (v.defeitosAbertos || []).length;
        return `<button type="button" class="veiculo ${uso ? 'off' : ''}" data-id="${escapar(v.id)}">
          <span class="veic-id">${F.iconeVeiculo(v)}${F.placaHtml(v)}</span>
          <span class="veiculo-info"><b>${escapar(nomeVeiculo(v))}</b>
            <small>${uso ? `${uso.status === 'aberta' ? 'Em uso por' : 'Preparada para'} ${escapar(primeiroNome(uso.condutor))}${uso.status === 'aberta' && uso.partida_hora ? ' desde ' + escapar(uso.partida_hora) : ''}`
              : `${v.tombamento ? 'Tomb. ' + escapar(v.tombamento) + ' · ' : ''}${v.ultimoKm != null ? 'último ' + m.nome + ' ' + escapar(m.grande(v.ultimoKm)) + (m.horimetro ? ' h' : '') : 'sem ' + m.nome}`}</small>
            ${def ? `<small class="txt-erro">${def} ${def === 1 ? 'defeito aberto' : 'defeitos abertos'}</small>` : ''}
            ${rev ? `<small class="txt-aviso">${escapar(rev)}</small>` : ''}
            ${lic ? `<small class="${lic.vencido ? 'txt-erro' : 'txt-aviso'}">${escapar(lic.texto)}</small>` : ''}
          </span></button>`;
      }).join('') || '<p class="dica">Nenhum veículo.</p>';
    };
    desenharLista('');
    const bv = $('#ppBuscaV');
    if (bv) bv.addEventListener('input', () => desenharLista(bv.value));
    $('#ppVeiculos').addEventListener('click', async e => {
      const b = e.target.closest('.veiculo');
      if (!b) return;
      if (b.classList.contains('off')) {
        const uso = ocupacao().find(x => x.veiculoId === b.dataset.id);
        if (!(await F.confirmar('Veículo em uso', `${nomeVeiculo(uso)} está ${uso.status === 'aberta' ? 'em uso por' : 'preparado para'} ${uso.condutor}. Usar mesmo assim?`, 'Usar', false))) return;
      }
      if (rascunho.veiculoId !== b.dataset.id) {
        // Km (ou horímetro) de saída já vem com o último registro do veículo; o chefe muda se precisar
        const v = veiculo(b.dataset.id);
        rascunho.km = v && v.ultimoKm != null ? F.medidor(v).texto(v.ultimoKm) : '';
      }
      rascunho.veiculoId = b.dataset.id;
      passo = 3;
      desenharPasso();
    });
    $('#ppSemVeiculo').addEventListener('click', () => { rascunho.veiculoId = null; rascunho.km = ''; passo = 3; desenharPasso(); });
  }

  function passoServico(caixa) {
    const f = funcionario(rascunho.rgf) || {};
    const v = veiculo(rascunho.veiculoId);
    const recentes = F.descricoesRecentes();
    const m = F.medidor(v);
    caixa.innerHTML = `<h2 class="titulo-tela">Qual é o serviço?</h2><p class="dica">${escapar(primeiroNome(f.nome))} · ${escapar(v ? nomeVeiculo(v) : 'veículo no papel')}</p>
      <div class="cartao cartao-solto">
        <label class="campo"><span>O que vai ser feito e onde</span><textarea id="ppDescricao" rows="4" autocapitalize="sentences">${escapar(rascunho.descricao)}</textarea></label>
        <small class="medidor" id="ppMedidor"></small>
        ${recentes.length ? `<p class="dica">Usadas antes (toque para repetir):</p><div class="chips chips-quebra">${recentes.map(t => `<button type="button" class="chip" data-desc="${escapar(t)}">${escapar(t)}</button>`).join('')}</div>` : ''}
        <label class="campo"><span>Data da FR</span><input id="ppData" type="date" value="${escapar(rascunho.data)}"></label>
      </div>
      <div class="cartao cartao-solto">
        <label class="campo"><span>${m.Nome} de saída</span><input id="ppKm" inputmode="${m.teclado}" autocomplete="off" value="${escapar(rascunho.km)}" placeholder="Pode deixar em branco"></label>
        ${v && v.ultimoKm != null ? `<p class="dica">Último registro do veículo: <b>${escapar(m.grande(v.ultimoKm))} ${m.un}</b> <button type="button" class="link" id="ppKmUltimo">Usar de novo</button></p>` : ''}
        <p class="dica">Horário de saída e combustível o funcionário anota na hora de sair.</p>
      </div>
      <button type="button" class="btn btn-texto link-completa" id="ppCompleta">O funcionário esqueceu? Preencher a FR completa</button>
      <p class="${usaApp(f) ? 'dica' : 'aviso'}">${usaApp(f) ? `${escapar(primeiroNome(f.nome))} usa o app: a FR aparece no celular dele assim que você salvar.`
        : `${escapar(primeiroNome(f.nome))} não usa o app: imprima a FR e entregue a ele. Quando o papel voltar, toque em "Recebi o papel" e anote o ${m.nome}.`}</p>`;
    $('#ppKm').addEventListener('input', e => { rascunho.km = e.target.value.trim(); previaDepois(); });
    $('#ppCompleta').addEventListener('click', completa);
    const usar = $('#ppKmUltimo');
    if (usar) usar.addEventListener('click', () => { rascunho.km = $('#ppKm').value = m.texto(v.ultimoKm); previa(); });
    const medir = () => {
      const r = global.FrPdf.medir('descricao', rascunho.descricao || '');
      const el = $('#ppMedidor');
      el.textContent = r && rascunho.descricao.trim() ? (r.cabe ? `${r.usadas} de ${r.total} linhas da FR` : `Não cabe nas ${r.total} linhas da FR`) : '';
      el.classList.toggle('cheio', !!r && !r.cabe);
    };
    $('#ppDescricao').addEventListener('input', e => { rascunho.descricao = e.target.value; medir(); previaDepois(); });
    $('#ppData').addEventListener('input', e => { rascunho.data = e.target.value || F.hoje(); previaDepois(); });
    $$('[data-desc]', caixa).forEach(c => c.addEventListener('click', () => {
      rascunho.descricao = $('#ppDescricao').value = c.dataset.desc;
      medir();
      previa();
    }));
    medir();
  }

  // FR que vai para o banco a partir do rascunho
  function montarFr() {
    const f = funcionario(rascunho.rgf) || {};
    const v = veiculo(rascunho.veiculoId);
    const m = F.medidor(v);
    const x = {
      id: Db.novoId(), status: 'preparada', data: rascunho.data,
      rgf: f.rgf || '', condutor: f.nome || '', cargo: f.cargo || '',
      veiculoId: v ? v.id : null, tombamento: '', marca: '', modelo: '', placa: '', medidor: 'km',
      kmEsperado: '', partida_km: rascunho.km, partida_hora: '', combustivel: '',
      descricao: rascunho.descricao.trim(), checklist: {}, defeitosItens: {}, itinerario: [],
      preparadaPor: quem(),
    };
    if (v) {
      ['tombamento', 'marca', 'modelo', 'placa'].forEach(k => { x[k] = v[k] || ''; });
      x.medidor = v.medidor === 'horimetro' ? 'horimetro' : 'km';
      x.kmEsperado = v.ultimoKm != null ? m.texto(v.ultimoKm) : '';
    }
    return x;
  }

  // FR que o funcionário esqueceu de fazer: o chefe preenche a ficha inteira e ela já fica encerrada
  async function completa() {
    if (!rascunho.descricao.trim()) { F.avisar('Descreva o serviço', 'erro'); return; }
    const x = montarFr();
    x.checklist = F.checklistTudoOk();
    x.retorno_km = '';
    F.lembrarDescricao(x.descricao);
    Db.criarFrPreparada(x).catch(e => { console.error('[chefe] completa', e); F.avisar('A FR não foi salva: ' + (e.code === 'permission-denied' ? 'sem permissão' : e.message), 'erro'); });
    global.FrFicha.editarFr(x, {
      aviso: `FR completa de ${x.condutor} (${F.dataCurta(x.data)}): preencha saída, itinerário e retorno.`,
      salvar: y => Db.salvarFrChefe(Object.assign(y, { status: 'fechada', completaPor: eu().nome }), eu().nome, veiculo(y.veiculoId)),
      voltar: abrir,
    });
    F.estado.edicaoAdmMudou = true; // salva (encerrada) mesmo sem mudar nada
  }

  async function salvar(imprimirDepois) {
    if (!rascunho.descricao.trim()) { passo = 3; desenharPasso(); F.avisar('Descreva o serviço', 'erro'); return; }
    const x = montarFr();
    F.lembrarDescricao(x.descricao);
    Db.criarFrPreparada(x).catch(e => { console.error('[chefe] preparar', e); F.avisar('A FR não foi salva: ' + (e.code === 'permission-denied' ? 'sem permissão' : e.message), 'erro'); });
    abrir();
    const f = funcionario(x.rgf);
    if (usaApp(f)) global.FrAnim.enviada();
    F.avisar(usaApp(f) ? `FR preparada: já está no celular de ${primeiroNome(x.condutor)}` : 'FR preparada');
    if (imprimirDepois) {
      try { await F.gerarEMostrarPdf(x, `FR de ${x.condutor} pronta. Imprima e entregue.`, { aoImprimir: marcarImpressas }); }
      catch (e) { F.avisar('Não foi possível gerar o PDF: ' + e.message, 'erro'); }
    }
  }

  // Prévia do papel (computador): a página da frente da FR como vai sair
  let previaTimer = null;
  const previaDepois = () => { clearTimeout(previaTimer); previaTimer = setTimeout(previa, 600); };
  let papelPreparar = null;
  function previa() {
    const caixa = $('#prepararPrevia');
    if (!caixa || !L.comPainel() || !rascunho) return;
    if (!papelPreparar) papelPreparar = L.criarPapel($('#prepararPapel'));
    caixa.hidden = false;
    papelPreparar.mostrar(montarFr());
  }

  $('#btnPrepararVoltar').addEventListener('click', () => {
    if (passo === 1) { abrir(); return; }
    passo--;
    desenharPasso();
  });
  $('#btnPrepararAvancar').addEventListener('click', () => {
    if (passo === 3) salvar(!usaApp(funcionario(rascunho.rgf)));
  });
  $('#btnPrepararSo').addEventListener('click', () => salvar(false));

  // Botão voltar do Android: dos dias anteriores volta para hoje
  function voltar() {
    if (!anteriores || document.body.dataset.tela !== 'equipe') return false;
    anteriores = null;
    desenhar();
    window.scrollTo(0, 0);
    return true;
  }
  const emSubtela = () => !!anteriores && document.body.dataset.tela === 'equipe';

  global.FrChefe = { abrir, desligar, voltar, emSubtela };
})(window);
