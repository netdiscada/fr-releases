// FR - modo dia: "Começar o dia" passo a passo, botões de saída/chegada e "Encerrar o dia".
// O funcionário só digita o km; horários, km sugerido, veículo e defeitos vêm sozinhos.

(function (global) {
  const F = global.FR;
  const { $, $$, escapar } = F;
  const fr = () => F.frAtual();
  const COMBUSTIVEIS = ['cheio', '3/4', '1/2', '1/4'];

  const veiculo = id => (F.veiculos || []).find(v => v.id === id) || null;
  const primeiroNome = n => (n || '').trim().split(/\s+/)[0] || '';
  function saudacao() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
  const rotuloVeiculo = v => [v.modelo || v.marca, v.placa].filter(Boolean).join(' · ') || 'Veículo';

  // Último km conhecido do dia (chegada mais recente, saída ou partida)
  function ultimoKm() {
    const it = fr().itinerario;
    for (let i = it.length - 1; i >= 0; i--) {
      if (it[i].chegada_km) return it[i].chegada_km;
      if (it[i].saida_km) return it[i].saida_km;
    }
    return fr().partida_km || '';
  }
  const M = () => F.medidor(fr()); // km ou horímetro da FR atual
  const emAndamento = () => { const it = fr().itinerario; const u = it[it.length - 1]; return u && !u.chegada_hora ? u : null; };

  function alertaRevisao(v) {
    if (!v || !v.revisaoKm || v.ultimoKm == null) return '';
    const m = F.medidor(v);
    const faltam = v.revisaoKm - v.ultimoKm;
    if (faltam > (m.horimetro ? 50 : 500)) return '';
    return faltam <= 0 ? `Revisão vencida (era em ${m.texto(v.revisaoKm)} ${m.un})` : `Revisão em ${m.texto(faltam)} ${m.un}`;
  }
  // Revisão e licenciamento do veículo, para mostrar na tela
  function alertasVeiculo(v) {
    const l = F.alertaLicenciamento(v);
    const r = alertaRevisao(v);
    return (l ? `<p class="${l.vencido ? 'txt-erro' : 'txt-aviso'}">${escapar(l.texto)}</p>` : '') + (r ? `<p class="txt-aviso">${escapar(r)}</p>` : '');
  }

  // ---------- folha genérica com formulário ----------
  // semCancelar: folha só de informação (o botão principal já fecha)
  function folhaForm({ titulo, html, botao, aoAbrir, aoOk, semCancelar }) {
    $('#folhaFormTitulo').textContent = titulo;
    $('#folhaForm .btn-texto[data-fechar]').hidden = !!semCancelar;
    $('#folhaFormCorpo').innerHTML = html;
    const ok = $('#folhaFormOk');
    ok.textContent = botao;
    const novo = ok.cloneNode(true); // remove ouvintes de usos anteriores
    ok.replaceWith(novo);
    novo.addEventListener('click', async () => {
      novo.disabled = true;
      try { if ((await aoOk($('#folhaFormCorpo'))) !== false) F.fecharFolha('folhaForm'); }
      finally { novo.disabled = false; }
    });
    F.abrirFolha('folhaForm');
    if (aoAbrir) aoAbrir($('#folhaFormCorpo'));
  }
  F.folhaForm = folhaForm;

  function chipsHtml(lista, attr) {
    return lista.length ? `<div class="chips chips-quebra">${lista.map(t => `<button type="button" class="chip" ${attr}="${escapar(t)}">${escapar(t)}</button>`).join('')}</div>` : '';
  }

  // =====================================================================
  // Início
  // =====================================================================
  function inicio() {
    const p = F.perfil() || {};
    // O chefe só cuida da equipe (a FR dele, se precisar, ele prepara e usa no papel)
    if (F.ehChefe() && global.FrChefe) { global.FrChefe.abrir(); return; }
    if (F.estado.convidadoId && !F.convidada()) F.usarConvidada(null); // colega parou de compartilhar
    const convidado = !!F.convidada();
    const atual = fr();
    const caixa = $('#inicio');
    // Sem o topo nesta tela (sobra espaço no celular): o menu ⋮ fica ao lado da saudação
    let html = `<div class="ola ola-menu"><div><h2>${saudacao()}, ${escapar(primeiroNome(p.nome))}</h2><p>${escapar(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p></div>
      <button type="button" class="icone-btn" id="btnMenuOla" aria-label="Mais opções"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button></div>`;

    // FRs que colegas compartilharam com este funcionário
    if (!convidado) {
      F.compartilhadas().forEach(c => {
        html += `<div class="cartao cartao-solto compartilhada">
          <div class="linha-entre"><b>${escapar(rotuloVeiculo(c))}</b><span class="selo">Compartilhada</span></div>
          <p class="dica">${escapar(c.condutor)} compartilhou a FR deste veículo com você.</p>
          <button type="button" class="btn btn-principal" data-usar-fr="${escapar(c.id)}">Usar a FR de ${escapar(primeiroNome(c.condutor))}</button>
        </div>`;
      });
    }

    if (convidado) {
      html += heroi(atual, `FR de ${primeiroNome(atual.condutor)} · compartilhada`,
        `<p class="dica">Você está usando a FR de ${escapar(atual.condutor)}. Registre as suas paradas normalmente.</p>`);
      html += `<h3 class="secao">Itinerário</h3><ol class="roteiro">${roteiro(atual)}</ol>`;
      html += botaoParada(atual, `<div class="blocos">
          ${bloco('btnDevolver', ICONES.chave, 'Devolvi o carro', 'destaque')}
          ${bloco('btnSairConvidado', ICONES.voltar, F.estado.fr && F.estado.fr.status === 'aberta' ? 'Minha FR' : 'Voltar')}
        </div>`);
    } else if (!atual || atual.status !== 'aberta') {
      const prep = F.preparadas();
      prep.forEach(c => {
        const futura = c.data > F.hoje();
        html += `<div class="cartao cartao-solto preparada-cartao">
          <div class="linha-entre"><b>${escapar(primeiroNome(c.preparadaPor && c.preparadaPor.nome) || 'O chefe')} preparou sua FR</b><span class="selo selo-preparada">${futura ? 'Para ' + escapar(F.dataCurta(c.data)) : 'Hoje'}</span></div>
          <div class="preparada-veiculo">${F.placaHtml(c)}<span><b>${escapar([c.marca, c.modelo].filter(Boolean).join(' ') || 'Veículo')}</b>${c.descricao ? `<small>${escapar(c.descricao)}</small>` : ''}</span></div>
          ${futura ? '' : `<button type="button" class="btn btn-principal" data-comecar-prep="${escapar(c.id)}">Começar com esta FR</button>`}
          <button type="button" class="btn btn-texto" data-passar-prep="${escapar(c.id)}">Passar para um colega</button>
        </div>`;
      });
      html += prep.length
        ? `<button type="button" class="btn btn-claro" id="btnComecarDia">${global.FrAnim.chaveIgnicao()}Começar outra FR</button>`
        : `<button type="button" class="btn btn-principal btn-grande" id="btnComecarDia">${global.FrAnim.chaveIgnicao()}Começar o dia</button>
        <p class="dica centro">Escolha o veículo, confira o km (ou horímetro) e faça a inspeção. O resto o app preenche.</p>`;
      carregarAnteriores();
      // Lista guardada no celular aparece na hora; a do banco chega por trás (sinal fraco demorava ~10 s)
      if (!F.minhasFrs) F.minhasFrs = anterioresGuardadas();
      let anteriores = F.minhasFrs || [];
      // A que acabou de ser encerrada aparece mesmo antes de a lista do banco voltar (no mesmo cartão)
      if (atual && atual.status === 'fechada' && !anteriores.some(f => f.id === atual.id)) {
        anteriores = [Object.assign({ uid: null }, atual)].concat(anteriores).slice(0, 10);
      }
      if (anteriores.length) {
        html += `<h3 class="secao">Minhas FRs anteriores</h3>` + anteriores.map(f => `<div class="cartao cartao-solto fr-anterior" data-anterior="${escapar(f.id)}">
          <div class="fr-ant-topo">${MINI_FR}<span class="fr-ant-info"><b>${escapar(F.dataCurta(f.data))} · ${escapar(rotuloVeiculo(f))}</b>
            <small>${escapar([kmRodado(f), (f.itinerario || []).length ? `${f.itinerario.length} ${f.itinerario.length === 1 ? 'parada' : 'paradas'}` : ''].filter(Boolean).join(' · '))}</small></span><span class="selo selo-ok">Encerrada</span></div>
          <div class="acoes"><button type="button" class="link" data-ant="pdf">${F.ic('pdf')}Ver PDF</button><button type="button" class="link" data-ant="corrigir">${F.ic('editar')}Corrigir</button><button type="button" class="link link-perigo" data-ant="apagar">${F.ic('excluir')}Apagar</button></div>
        </div>`).join('');
      }
    } else {
      const v = veiculo(atual.veiculoId);
      const velha = atual.data !== F.hoje();
      const com = (atual.compartilhadoCom || []).map(c => primeiroNome(c.nome)).join(', ');
      html += heroi(atual, `Em serviço desde ${atual.partida_hora || '--:--'}`,
        (velha ? `<p class="aviso">Esta FR é de ${F.dataCurta(atual.data)} e ainda não foi encerrada.</p>` : '') + (v ? alertasVeiculo(v) : ''));
      html += `<h3 class="secao">Itinerário</h3><ol class="roteiro">${roteiro(atual)}</ol>
        ${com ? `<p class="dica">Compartilhada com ${escapar(com)}</p>` : ''}`;
      html += botaoParada(atual, `<div class="blocos">
          ${bloco('btnIrEncerrar', F.ic('bandeira'), 'Encerrar o dia', 'destaque')}
          ${bloco('btnCompartilhar', F.ic('colega'), com ? 'Compartilhada' : 'Compartilhar')}
          ${bloco('btnVerFicha', F.ic('ficha'), 'Ficha completa')}
          ${bloco('btnCancelarFr', F.ic('cancelar'), 'Cancelar FR', 'perigo')}
        </div>`);
    }
    caixa.innerHTML = html;
    cenaEstrada(atual && atual.status === 'aberta' ? atual.placa : '');
    global.FrAnim.rolar(caixa);

    const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
    on('btnMenuOla', () => $('#btnMenu').click());
    // Cada botão faz o seu gesto (curto) e então segue
    on('btnComecarDia', e => global.FrAnim.ignicao(e.currentTarget).then(comecar));
    on('btnSaida', folhaSaida);
    on('btnChegada', folhaChegada);
    on('btnIrEncerrar', () => global.FrAnim.pausa(260).then(abrirEncerrar));
    on('btnVerFicha', e => global.FrAnim.folhear(e.currentTarget).then(() => global.FrFicha.abrir()));
    on('btnCancelarFr', cancelarFr);
    on('btnCompartilhar', e => global.FrAnim.envio(e.currentTarget).then(folhaCompartilhar));
    on('btnDevolver', devolver);
    on('btnSairConvidado', () => { F.usarConvidada(null); inicio(); });
    $$('[data-usar-fr]', caixa).forEach(b => b.addEventListener('click', () => { F.usarConvidada(b.dataset.usarFr); inicio(); }));
    $$('[data-ant]', caixa).forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('[data-anterior]').dataset.anterior;
      const achar = () => (F.minhasFrs || []).find(x => x.id === id) || (F.estado.fr && F.estado.fr.id === id ? Object.assign({ uid: null }, F.estado.fr) : null);
      let f = achar();
      if (!f) return;
      // Corrigir/apagar mexem no banco: se a lista ainda é a guardada no celular, pega a versão atual antes
      if (f._guardada && b.dataset.ant !== 'pdf') {
        F.avisar('Atualizando a FR…');
        await carregarAnteriores(true);
        f = achar();
        if (!f) { F.avisar('Essa FR não está mais no sistema', 'erro'); inicio(); return; }
      }
      if (b.dataset.ant === 'pdf') {
        F.gerarEMostrarPdf(f, `FR de ${F.dataCurta(f.data)}.`, { aoImprimir: l => global.FrDb.marcarImpressas(l.map(x => x.id), f.condutor).catch(() => {}) })
          .catch(e => F.avisar(e.message, 'erro'));
        return;
      }
      if (b.dataset.ant === 'apagar') { apagarAnterior(f); return; }
      corrigirAnterior(f);
    }));
    const prepPorId = id => F.preparadas().find(c => c.id === id);
    $$('[data-comecar-prep]', caixa).forEach(b => b.addEventListener('click', () => { const c = prepPorId(b.dataset.comecarPrep); if (c) comecarPreparada(c); }));
    $$('[data-passar-prep]', caixa).forEach(b => b.addEventListener('click', () => { const c = prepPorId(b.dataset.passarPrep); if (c) passarPreparada(c); }));
    F.mostrarTela('inicio');
  }

  // ---------- FRs anteriores do funcionário (do banco: já com as correções do ADM/chefe) ----------
  let anterioresEm = 0;
  // Cópia das FRs anteriores no celular (por RGF): aparecem na hora ao abrir o app
  const chaveAnteriores = () => 'fr.minhasFrs.v1.' + ((F.perfil() || {}).rgf || '');
  function anterioresGuardadas() {
    const l = F.ler(chaveAnteriores(), null);
    return Array.isArray(l) ? l.map(f => Object.assign(f, { _guardada: true })) : null;
  }
  let pedidoAnteriores = null;
  function carregarAnteriores(forcar) {
    const p = F.perfil();
    if (!p) return Promise.resolve();
    if (pedidoAnteriores) return pedidoAnteriores;
    if (!forcar && Date.now() - anterioresEm < 60000) return Promise.resolve();
    pedidoAnteriores = global.FrDb.frsDoRgf(p.rgf).then(lista => {
      F.minhasFrs = lista.filter(f => f.status === 'fechada')
        .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.retorno_hora || '').localeCompare(a.retorno_hora || '')).slice(0, 10);
      anterioresEm = Date.now();
      F.gravar(chaveAnteriores(), F.minhasFrs.map(f => { const c = Object.assign({}, f); delete c._guardada; return c; }));
      if (document.body.dataset.tela === 'inicio' && !document.querySelector('.folha:not([hidden])')) inicio();
    }).catch(e => console.warn('[FR] FRs anteriores', e.code || e))
      .finally(() => { pedidoAnteriores = null; });
    return pedidoAnteriores;
  }

  // O funcionário apaga uma FR anterior (de teste, feita errada). O km que ela deixou no veículo não muda.
  async function apagarAnterior(f) {
    if (!(await F.confirmar('Apagar esta FR?', `A FR de ${F.dataCurta(f.data)} (${rotuloVeiculo(f)}) sai do sistema. Não dá para desfazer.`, 'Apagar'))) return;
    global.FrDb.excluirFr(f.id).catch(e => F.avisar('Não foi possível apagar: ' + (e.code === 'permission-denied' ? 'sem permissão' : e.message), 'erro'));
    F.minhasFrs = (F.minhasFrs || []).filter(x => x.id !== f.id);
    F.gravar(chaveAnteriores(), F.minhasFrs.map(x => { const c = Object.assign({}, x); delete c._guardada; return c; }));
    if (F.estado.fr && F.estado.fr.id === f.id) { F.estado.fr = null; F.salvarAgora(); }
    inicio();
    F.avisar('FR apagada');
  }

  // O funcionário corrige uma FR já encerrada (errou algo): mesma ficha completa, grava ao salvar
  function corrigirAnterior(f) {
    global.FrFicha.editarFr(f, {
      aviso: `Corrigindo a sua FR de ${F.dataCurta(f.data)}.`,
      salvar: async (x, antes) => {
        await global.FrDb.salvarFrFuncionario(x, f.uid, veiculo(x.veiculoId));
        // A FR de hoje no mesmo veículo saiu com o km de retorno errado desta: corrige junto
        const hoje = F.estado.fr;
        if (hoje && hoje.id !== x.id && hoje.status === 'aberta' && hoje.veiculoId && hoje.veiculoId === x.veiculoId
          && antes.retorno_km !== x.retorno_km && F.aplicarCorrecaoKm(hoje, antes.retorno_km, x.retorno_km)) {
          F.sincronizar();
          return 'Correção salva. O km de saída da FR de hoje também foi corrigido.';
        }
      },
      voltar: () => {
        if (F.estado.fr && F.estado.fr.id === f.id && F.estado.fr.status !== 'aberta') { F.estado.fr = F.paraLocal(f); F.salvarAgora(); }
        inicio();
      },
    });
  }

  // ---------- FR que o chefe preparou ----------
  // Passa a FR (antes de começar) para um colega pelo RGF
  function passarPreparada(c) {
    folhaForm({
      titulo: 'Passar a FR',
      botao: 'Passar',
      html: `<p class="dica">A FR de ${escapar(rotuloVeiculo(c))} vai para o colega. Ela aparece no celular dele (ou ele usa o papel).</p>
        <label class="campo"><span>RGF do colega</span><input id="ppRgf" inputmode="numeric" autocomplete="off" maxlength="10"></label>`,
      aoAbrir: () => setTimeout(() => { const c = $('#ppRgf'); if (c) c.focus(); }, 250),
      aoOk: async () => {
        const rgf = $('#ppRgf').value.replace(/\D/g, '');
        if (rgf.length < 3) { F.avisar('Digite o RGF do colega', 'erro'); return false; }
        if (rgf === c.rgf) { F.avisar('Esse é o seu RGF', 'erro'); return false; }
        let snap;
        try { snap = await global.FrDb.consultarRgf(rgf); }
        catch (e) { F.avisar('Sem internet. Para passar a FR o celular precisa estar conectado.', 'erro'); return false; }
        const d = snap.dados;
        if (!d || !d.aprovado) { F.avisar('RGF não encontrado', 'erro'); return false; }
        if (!(await F.confirmar('Passar a FR?', `A FR de ${rotuloVeiculo(c)} vai para ${d.nome} (RGF ${rgf}).`, 'Passar', false))) return false;
        try {
          await global.FrDb.passarFr(c.id, { rgf, nome: d.nome, cargo: d.cargo }, { rgf: c.rgf, nome: c.condutor });
          F.listaPreparadas = F.preparadas().filter(x => x.id !== c.id);
          inicio();
          F.avisar(`FR passada para ${primeiroNome(d.nome)}`);
        } catch (e) { F.avisar('Não foi possível passar: ' + (e.message || e), 'erro'); return false; }
      },
    });
  }

  // Começa o dia com a FR preparada: veículo e serviço já vêm escolhidos, o funcionário confere o km,
  // faz a inspeção e começa. O celular passa a ser o dono da FR.
  function comecarPreparada(c) {
    F.usarConvidada(null);
    antesDeComecar = F.estado.fr;
    const x = F.paraLocal(c);
    if (x.data < F.hoje()) x.data = F.hoje();
    const v = veiculo(x.veiculoId);
    F.estado.fr = x;
    if (v) {
      const { partida_km: km, combustivel: comb } = x;
      escolherVeiculo(v);
      if (km) x.partida_km = km;
      if (comb) x.combustivel = comb;
    } else {
      x.checklist = Object.keys(x.checklist).length ? x.checklist : F.checklistTudoOk();
    }
    x._preparada = true;
    global.FrDb.assumirFr(x.id).catch(e => console.warn('[FR] assumir preparada', e.code || e));
    inicioPasso = 1;
    passo = 1;
    desenharPasso();
    F.mostrarTela('comecar');
  }

  // Botão principal fixo embaixo (onde o polegar alcança)
  // Embaixo, onde o polegar alcança: os quadradinhos das ações e, logo abaixo, o botão de saída/chegada
  function botaoParada(atual, blocos = '') {
    const andando = emAndamento();
    if (andando) return `<div class="acao-fixa">${blocos}<button type="button" class="btn btn-claro-forte" id="btnChegada">${ICONES.pino}Cheguei${andando.local ? ' em ' + escapar(andando.local) : ''}</button></div>`;
    if (atual.itinerario.length < global.FrPdf.MAX_PARADAS) return `<div class="acao-fixa">${blocos}<button type="button" class="btn btn-principal" id="btnSaida">${ICONES.seta}Saindo para uma parada</button></div>`;
    return `<p class="aviso">As 16 linhas do itinerário da FR estão cheias.</p>${blocos ? `<div class="acao-fixa">${blocos}</div>` : ''}`;
  }

  // ---------- peças da tela do dia ----------
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONES = {
    seta: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
    pino: svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    chave: svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/>'),
    voltar: svg('<path d="m15 18-6-6 6-6"/>'),
    seguir: svg('<path d="m9 18 6-6-6-6"/>'),
  };
  // Uma FR em miniatura (cabeçalho, linhas e o quadro do km), para os cartões das FRs anteriores
  const MINI_FR = '<svg class="mini-fr" viewBox="0 0 30 40" aria-hidden="true"><rect x=".5" y=".5" width="29" height="39" rx="2" fill="#fff"/><rect x="3" y="3" width="24" height="4" rx=".8" fill="#F2A900"/><path d="M3 10h24M3 13h24M3 16h16" stroke="#9AA3AF"/><rect x="3" y="19" width="11" height="7" fill="none" stroke="#2D6CDF"/><rect x="16" y="19" width="11" height="7" fill="none" stroke="#9AA3AF"/><path d="M3 29h24M3 32h24M3 35h18" stroke="#9AA3AF"/></svg>';

  // Ações do dia: quadradinhos lado a lado, todos do mesmo tamanho
  const bloco = (id, icone, texto, classe = '') =>
    `<button type="button" class="bloco ${classe}" id="${id}"><span class="bloco-ic">${icone}</span><span>${escapar(texto)}</span></button>`;

  // Fundo animado da tela inicial (estrada e carro): criado uma vez, fora do conteúdo que é redesenhado
  function cenaEstrada(placa) {
    const tela = $('#tela-inicio');
    let c = $('.cena', tela);
    if (!c || c.dataset.placa !== (placa || '')) {
      if (c) c.remove();
      tela.insertAdjacentHTML('afterbegin', global.FrAnim.cena(placa));
      $('.cena', tela).dataset.placa = placa || '';
    }
  }

  // Cartão do veículo: placa, hodômetro (ou horímetro) agora e quanto rodou no dia
  function heroi(x, rotulo, extra) {
    const m = F.medidor(x);
    const ini = m.ler(x.partida_km), agora = m.ler(ultimoKm());
    const placa = F.placaHtml(x).replace('veiculo-placa', 'placa');
    const nome = [x.marca, x.modelo].filter(Boolean).join(' ') || 'Veículo';
    const det = x.tombamento ? 'Tomb. ' + x.tombamento : '';
    return `<section class="heroi">
      <div class="heroi-veiculo">${placa}<div><b>${escapar(nome)}</b>${det ? `<small>${escapar(det)}</small>` : ''}</div></div>
      <div class="heroi-km">
        <div><p class="heroi-rotulo">${escapar(rotulo)}</p><p class="odometro" role="img" aria-label="${agora != null ? escapar(m.grande(agora)) : 'sem registro'} ${m.un}" data-valor="${agora != null ? escapar(m.grande(agora)) : ''}">${agora != null ? global.FrAnim.digitos(m.grande(agora), 'od-' + x.id) : '—'}<span>${m.un}</span></p></div>
        ${ini != null && agora != null ? `<div class="heroi-rodado"><small>${m.horimetro ? 'trabalhadas hoje' : 'rodados hoje'}</small><b>${escapar(m.texto(agora - ini))} ${m.un}</b></div>` : ''}
      </div>
      ${extra || ''}
    </section>`;
  }

  // Itinerário como na 2ª folha da FR: cada parada com km e hora da saída e da chegada, ligadas por uma
  // linha de bolinhas numeradas. A saída da base fica de fora (todo mundo sabe de onde o carro sai).
  function roteiro(x) {
    const m = F.medidor(x);
    if (!x.itinerario.length) return '<li class="roteiro-vazio">Nenhuma parada ainda. Ao sair, toque em "Saindo para uma parada".</li>';
    // Km no mesmo formato do papel (2.515), venha como vier digitado
    const km = v => { const n = m.ler(v); return n != null ? `${m.grande(n)} ${m.un}` : '—'; };
    return x.itinerario.map((p, i) => {
      const chegou = !!p.chegada_hora;
      const a = m.ler(p.saida_km), b = m.ler(p.chegada_km);
      const tempo = duracao(p.saida_hora, chegou ? p.chegada_hora : F.agora());
      const delta = chegou && a != null && b != null ? `+${m.texto(b - a)} ${m.un}` : '';
      return `<li class="${chegou ? 'chegou' : 'andando'}">
        <span class="roteiro-ponto">${i + 1}</span>
        <span class="roteiro-txt"><b>${escapar(p.local || 'Parada')}</b>
          <span class="roteiro-linha"><small>Saída</small><span class="junto">${escapar(km(p.saida_km))} · ${escapar(p.saida_hora || '--:--')}</span></span>
          ${chegou ? `<span class="roteiro-linha"><small>Chegada</small><span class="junto">${escapar(km(p.chegada_km))} · ${escapar(p.chegada_hora)}</span></span>`
            : `<span class="roteiro-linha roteiro-caminho">A caminho${tempo && tempo !== '0 min' ? ' há ' + tempo : ''}</span>`}</span>
        <span class="roteiro-delta">${delta ? `<b>${escapar(delta)}</b>` : ''}${chegou && tempo ? `<small>${tempo}</small>` : ''}</span>
      </li>`;
    }).join('');
  }
  // Tempo entre dois horários "hh:mm" (passando da meia-noite, conta o dia seguinte)
  function duracao(h1, h2) {
    const min = h => { const r = /^(\d\d):(\d\d)$/.exec(h || ''); return r ? +r[1] * 60 + +r[2] : null; };
    const a = min(h1), b = min(h2);
    if (a == null || b == null) return '';
    const n = (b - a + 1440) % 1440;
    if (n > 720) return ''; // passou de 12 h: é horário de saída à frente de agora, não um dia inteiro
    return n < 60 ? `${n} min` : `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`;
  }


  // ---------- compartilhar a FR ----------
  // O dono escolhe o colega pelo RGF; o colega registra paradas como se fosse o dono (o PDF sai no nome do dono).
  function folhaCompartilhar() {
    const x = F.estado.fr;
    const lista = x.compartilhadoCom || [];
    folhaForm({
      titulo: 'Compartilhar a FR',
      botao: 'Compartilhar',
      html: `<p class="dica">Quem pegar o carro por um tempo registra as paradas nesta FR pelo celular dele. O PDF continua no seu nome.</p>
        ${lista.map(c => `<div class="defeito"><span>${escapar(c.nome)}<small>RGF ${escapar(c.rgf)}</small></span>
          <button type="button" class="link link-perigo" data-parar="${escapar(c.uid)}">Parar</button></div>`).join('')}
        <label class="campo"><span>RGF do colega</span><input id="fcRgf" inputmode="numeric" autocomplete="off" maxlength="10"></label>`,
      aoAbrir: corpo => {
        $$('[data-parar]', corpo).forEach(b => b.addEventListener('click', () => {
          x.compartilhadoCom = lista.filter(c => c.uid !== b.dataset.parar);
          x.compartilhadoUids = x.compartilhadoCom.map(c => c.uid);
          F.sincronizar();
          F.fecharFolha('folhaForm');
          inicio();
          F.avisar('Compartilhamento encerrado');
        }));
      },
      aoOk: async () => {
        const rgf = $('#fcRgf').value.replace(/\D/g, '');
        if (rgf.length < 3) { F.avisar('Digite o RGF do colega', 'erro'); return false; }
        if (rgf === x.rgf) { F.avisar('Esse é o seu RGF', 'erro'); return false; }
        let c;
        try { c = await global.FrDb.colega(rgf); }
        catch (e) { F.avisar('Sem internet. Para compartilhar o celular precisa estar conectado.', 'erro'); return false; }
        if (c.erro) { F.avisar(c.erro, 'erro'); return false; }
        if (lista.some(o => o.uid === c.uid)) { F.avisar(`Já está compartilhada com ${c.nome}`, 'erro'); return false; }
        if (!(await F.confirmar('Compartilhar a FR?', `${c.nome} (RGF ${c.rgf}) vai poder registrar paradas nesta FR até você parar o compartilhamento ou ele devolver o carro.`, 'Compartilhar', false))) return false;
        x.compartilhadoCom = lista.concat([c]);
        x.compartilhadoUids = x.compartilhadoCom.map(o => o.uid);
        F.sincronizar();
        inicio();
        global.FrAnim.enviada();
        F.avisar(`FR compartilhada com ${primeiroNome(c.nome)}`);
      },
    });
  }

  async function devolver() {
    const c = F.convidada();
    if (emAndamento()) { F.avisar('Registre a chegada antes de devolver', 'erro'); return; }
    if (!(await F.confirmar('Devolveu o carro?', `Você deixa de registrar paradas na FR de ${c.condutor}.`, 'Devolvi', false))) return;
    global.FrDb.sairDaFr(c).catch(e => console.warn('[FR] devolver', e));
    F.listaCompartilhadas = F.compartilhadas().filter(f => f.id !== c.id);
    F.usarConvidada(null);
    inicio();
    F.avisar('Carro devolvido');
  }

  // FR aberta por engano: sai do banco e não mexe no km nem nos defeitos do veículo.
  async function cancelarFr() {
    const x = fr();
    if (!(await F.confirmar('Cancelar esta FR?', 'Tudo o que foi anotado nela será descartado e o veículo continua com o km de antes. Não dá para desfazer.', 'Cancelar a FR'))) return;
    global.FrDb.excluirFr(x.id).catch(() => {});
    await global.FrAnim.cancelada();
    F.estado.fr = null;
    F.salvarAgora();
    inicio();
    F.avisar('FR cancelada');
  }

  function kmRodado(x) {
    const m = F.medidor(x);
    const a = m.ler(x.partida_km), b = m.ler(x.retorno_km);
    return a != null && b != null ? `${m.texto(b - a)} ${m.un} ${m.horimetro ? 'trabalhadas' : 'rodados'}` : '';
  }

  // ---------- saída e chegada ----------
  // Tela "Nova parada": veículo e km de agora em cima, a lista de locais embaixo. Tocar no local = saiu.
  // O km de saída é o da última chegada (ou o da saída da base) e o horário é agora (dá para mudar).
  let paradaHora = null; // horário escolhido em "Mudar horário" (null = agora)
  function folhaSaida() {
    paradaHora = null;
    desenharParada('');
    F.mostrarTela('parada');
    // Cursor na busca, se a pessoa ainda não tocou em outro campo (ex.: Mudar horário)
    setTimeout(() => { const b = $('#npBusca'); const ativo = document.activeElement; if (b && (!ativo || ativo === document.body || !ativo.matches('input, textarea'))) b.focus({ preventScroll: true }); }, 50);
  }

  function opcoesParada(busca) {
    const x = fr();
    const q = F.chaveLocal(busca);
    const ultima = x.itinerario.length ? x.itinerario[x.itinerario.length - 1] : null;
    const vistos = new Set();
    const lista = [];
    const incluir = (texto, info) => {
      const k = F.chaveLocal(texto);
      if (!texto || vistos.has(k) || (q && !k.includes(q))) return;
      vistos.add(k);
      lista.push({ texto, info });
    };
    if (q) F.sugerirLocais(busca, 8).forEach(t => incluir(t, ''));
    if (ultima && ultima.local) incluir(ultima.local, `Última parada · ${ultima.chegada_hora || ultima.saida_hora || ''}`);
    F.historicoLocais(12).forEach(l => incluir(l.texto, `Você foi ${l.n} ${l.n === 1 ? 'vez' : 'vezes'}`));
    if (!q) (F.locais || []).slice().sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 8).forEach(l => incluir(l.texto, 'Usado pela equipe'));
    lista.forEach(l => { if (!l.info) { const p = F.historicoLocais(50).find(h => F.chaveLocal(h.texto) === F.chaveLocal(l.texto)); l.info = p ? `Você foi ${p.n} ${p.n === 1 ? 'vez' : 'vezes'}` : 'Usado pela equipe'; } });
    const digitado = String(busca || '').trim().replace(/\s+/g, ' ');
    // O que bate exatamente com o digitado vem primeiro
    const exato = lista.findIndex(l => F.chaveLocal(l.texto) === q);
    if (q && exato > 0) lista.unshift(lista.splice(exato, 1)[0]);
    if (digitado && exato < 0) {
      const ja = (F.locais || []).find(l => F.chaveLocal(l.texto) === q) || F.historicoLocais(50).find(l => F.chaveLocal(l.texto) === q);
      lista.unshift(ja ? { texto: ja.texto, info: 'Toque para sair' } : { texto: digitado, info: 'Local novo: toque para sair', novo: true });
    }
    return lista.slice(0, 12);
  }

  function desenharParada(busca) {
    const x = fr();
    const m = M();
    const k = m.ler(ultimoKm());
    const det = x.tombamento ? 'Tomb. ' + x.tombamento : '';
    $('#parada').innerHTML = `<div class="np-veiculo">${F.placaHtml(x)}
        <span class="np-nome"><b>${escapar([x.marca, x.modelo].filter(Boolean).join(' ') || 'Veículo')}</b>${det ? `<small>${escapar(det)}</small>` : ''}</span>
        <span class="np-km"><b>${k != null ? escapar(m.grande(k)) : '—'}</b><small>${m.horimetro ? 'HORÍMETRO' : 'KM AGORA'}</small></span></div>
      <div class="np-hora"><span>Saída às <b id="npHoraTxt">${escapar(paradaHora || F.agora())}</b></span>
        <button type="button" class="chip" id="npMudar">Mudar horário</button></div>
      <label class="campo" id="npHoraCampo" ${paradaHora ? '' : 'hidden'}><span>Horário da saída</span><input id="npHora" type="time" value="${escapar(paradaHora || F.agora())}"></label>
      <label class="campo"><input id="npBusca" autocapitalize="words" placeholder="Buscar ou digitar o local" aria-label="Buscar ou digitar o local" value="${escapar(busca)}"></label>
      <h3 class="secao">Toque no local para sair</h3>
      <div class="lista-acoes" id="npLista"></div>`;
    listarParada(busca);
    $('#npBusca').addEventListener('input', e => listarParada(e.target.value));
    $('#npBusca').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#btnParadaContinuar').click(); } });
    $('#npMudar').addEventListener('click', () => { $('#npHoraCampo').hidden = false; $('#npHora').focus(); });
    $('#npHora').addEventListener('input', e => {
      paradaHora = /^\d\d:\d\d$/.test(e.target.value) ? e.target.value : paradaHora;
      $('#npHoraTxt').textContent = paradaHora || F.agora();
    });
  }

  function listarParada(busca) {
    const lista = opcoesParada(busca);
    const caixa = $('#npLista');
    caixa.innerHTML = lista.length ? lista.map((l, i) => `<button type="button" class="acao np-local ${l.novo ? 'destaque' : ''}" data-i="${i}">
        <span class="acao-icone">${ICONES.pino}</span><span><b>${escapar(l.texto)}</b><small>${escapar(l.info)}</small></span>${ICONES.seguir}</button>`).join('')
      : '<p class="dica np-vazio">Digite o local para onde você vai.</p>';
    $$('[data-i]', caixa).forEach(b => b.addEventListener('click', () => sairPara(lista[+b.dataset.i].texto)));
  }

  // Continuar (ou Enter no teclado): sai para o que foi digitado, sem precisar tocar na lista
  $('#btnParadaContinuar').addEventListener('click', () => {
    const b = $('#npBusca');
    if (!b || !b.value.trim()) { F.avisar('Digite o local para onde você vai', 'erro'); if (b) b.focus(); return; }
    // O primeiro da lista é sempre o digitado (com o nome já cadastrado, se existir)
    const l = opcoesParada(b.value)[0];
    sairPara(l ? l.texto : b.value);
  });

  function sairPara(texto) {
    const local = String(texto || '').trim().replace(/\s+/g, ' ');
    if (!local) return;
    const hora = paradaHora || F.agora();
    F.registrarLocal(local);
    fr().itinerario.push({ saida_km: ultimoKm(), saida_hora: hora, local, chegada_km: '', chegada_hora: '' });
    F.sincronizar();
    inicio();
    global.FrAnim.saida();
    F.avisar(`Saída para ${local} registrada às ${hora}`);
  }

  function folhaChegada() {
    const p = emAndamento();
    folhaForm({
      titulo: `Chegada${p.local ? ' em ' + p.local : ''}`,
      botao: 'Registrar chegada',
      html: `<div class="grade">
          <label class="campo"><span>${M().horimetro ? 'Horímetro' : 'Km no hodômetro'}</span><input id="fcKm" inputmode="${M().teclado}" placeholder="Saiu com ${escapar(p.saida_km)}"></label>
          <label class="campo"><span>Horário</span><input id="fcHora" type="time" value="${F.agora()}"></label>
        </div>
        <p class="aviso" id="fcAviso" hidden></p>`,
      aoAbrir: () => setTimeout(() => { const c = $('#fcKm'); if (c) c.focus(); }, 250),
      aoOk: async () => {
        const km = $('#fcKm').value.trim();
        const m = M();
        if (!km) { F.avisar(`Digite o ${m.horimetro ? 'horímetro' : 'km do hodômetro'}`, 'erro'); return false; }
        const ini = m.ler(p.saida_km), fim = m.ler(km);
        if (ini != null && fim != null && fim < ini) { await F.kmMenor(m, ini, fim, 'da saída desta parada'); return false; }
        if (ini != null && fim != null && fim - ini > m.limiteParada
          && !(await F.confirmar(`Conferir o ${m.nome}`, `Foram ${m.texto(fim - ini)} ${m.un} nesta parada. Está certo?`, 'Está certo', false))) return false;
        // A FR pode ter sido atualizada pelo banco com a folha aberta: pega a parada de agora
        const q = emAndamento() || p;
        q.chegada_km = km;
        q.chegada_hora = $('#fcHora').value;
        F.lembrarLocal(q.local);
        F.sincronizar();
        inicio();
        global.FrAnim.chegada();
      },
    });
  }

  // =====================================================================
  // Começar o dia
  // =====================================================================
  const PASSOS = ['Veículo', 'Saída', 'Inspeção', 'Serviço'];
  let passo = 0;
  let inicioPasso = 0; // FR preparada começa no passo da saída (o veículo já veio escolhido)
  let antesDeComecar = null; // FR do celular antes de começar (volta para ela se cancelar)

  function comecar() {
    F.usarConvidada(null);
    antesDeComecar = F.estado.fr;
    F.estado.fr = F.frNova();
    inicioPasso = 0;
    passo = 0;
    desenharPasso();
    F.mostrarTela('comecar');
  }

  function desenharPasso() {
    $('#passosComecar').innerHTML = PASSOS.map((n, i) =>
      `<span class="${i < passo ? 'feito' : i === passo ? 'atual' : ''}">${i + 1}<span class="passo-nome">. ${n}</span></span>`).join('');
    $('#btnComecarVoltar').textContent = passo === inicioPasso ? 'Cancelar' : 'Voltar';
    $('#btnComecarAvancar').innerHTML = passo === PASSOS.length - 1 ? global.FrAnim.chaveIgnicao() + 'Começar o dia' : 'Continuar';
    $('#btnComecarAvancar').hidden = passo === 0; // no passo do veículo, tocar no cartão já avança
    [passoVeiculo, passoSaida, passoInspecao, passoServico][passo]($('#comecar'));
    window.scrollTo(0, 0);
  }

  // Veículos que este RGF mais usa vêm primeiro (contagem guardada no celular)
  const chaveUso = () => 'fr.usoVeiculos.v1.' + ((F.perfil() || {}).rgf || '');
  function contarUso(v) {
    const uso = F.ler(chaveUso(), {});
    uso[v.id] = { n: ((uso[v.id] || {}).n || 0) + 1, em: Date.now() };
    F.gravar(chaveUso(), uso);
  }

  function passoVeiculo(caixa) {
    const uso = F.ler(chaveUso(), {});
    const n = v => (uso[v.id] || {}).n || 0;
    const lista = (F.veiculos || []).slice().sort((a, b) => n(b) - n(a) || ((uso[b.id] || {}).em || 0) - ((uso[a.id] || {}).em || 0));
    const ultimo = Object.keys(uso).sort((a, b) => uso[b].em - uso[a].em)[0];
    caixa.innerHTML = `<h2 class="titulo-tela">Qual veículo hoje?</h2>
      ${lista.length > 6 ? '<label class="campo"><input id="buscaVeiculo" placeholder="Buscar por placa, modelo ou tombamento" autocomplete="off"></label>' : ''}
      <div class="lista-veiculos" id="listaVeiculos"></div>
      ${lista.length ? '' : '<p class="aviso">O ADM ainda não cadastrou veículos. Você pode preencher o veículo à mão na ficha completa.</p>'}
      <button type="button" class="btn btn-texto" id="btnVeiculoMao">Veículo fora da lista</button>`;
    const desenhar = filtro => {
      const f = (filtro || '').toLowerCase();
      $('#listaVeiculos').innerHTML = lista
        .filter(v => !f || [v.placa, v.modelo, v.marca, v.tombamento].join(' ').toLowerCase().includes(f))
        .map(v => {
          const defeitos = (v.defeitosAbertos || []).length;
          const rev = alertaRevisao(v);
          const lic = F.alertaLicenciamento(v);
          return `<button type="button" class="veiculo" data-id="${escapar(v.id)}">
            <span class="veic-id">${F.iconeVeiculo(v)}${F.placaHtml(v)}</span>
            <span class="veiculo-info">${v.id === ultimo ? '<span class="selo selo-novo selo-uso">Último usado</span>' : ''}<b>${escapar([v.marca, v.modelo].filter(Boolean).join(' '))}</b>
              <small>${v.tombamento ? 'Tomb. ' + escapar(v.tombamento) + ' · ' : ''}${v.ultimoKm != null ? escapar(F.medidor(v).grande(v.ultimoKm)) + ' ' + F.medidor(v).un : `sem ${F.medidor(v).nome} registrado`}</small>
              ${defeitos ? `<small class="txt-erro">${defeitos} ${defeitos === 1 ? 'defeito aberto' : 'defeitos abertos'}</small>` : ''}
              ${rev ? `<small class="txt-aviso">${escapar(rev)}</small>` : ''}
              ${lic ? `<small class="${lic.vencido ? 'txt-erro' : 'txt-aviso'}">${escapar(lic.texto)}</small>` : ''}
            </span></button>`;
        }).join('');
    };
    desenhar('');
    const busca = $('#buscaVeiculo');
    if (busca) busca.addEventListener('input', () => desenhar(busca.value));
    $('#listaVeiculos').addEventListener('click', async e => {
      const b = e.target.closest('.veiculo');
      if (!b || b.classList.contains('puxado')) return;
      contarUso(veiculo(b.dataset.id));
      escolherVeiculo(veiculo(b.dataset.id));
      // O desenho do carro sai andando e puxa a tela para o passo seguinte
      await global.FrAnim.puxar(b);
      global.FrAnim.transicao(() => { passo = 1; desenharPasso(); }, 'puxa');
    });
    $('#btnVeiculoMao').addEventListener('click', () => {
      fr().veiculoId = null;
      passo = 1;
      desenharPasso();
      F.avisar('Preencha o veículo depois na ficha completa');
    });
  }

  function escolherVeiculo(v) {
    const x = fr();
    ['tombamento', 'marca', 'modelo', 'placa'].forEach(c => { x[c] = v[c] || ''; });
    x.veiculoId = v.id;
    x.medidor = v.medidor === 'horimetro' ? 'horimetro' : 'km';
    x.kmEsperado = v.ultimoKm != null ? F.medidor(v).texto(v.ultimoKm) : '';
    x.partida_km = x.kmEsperado;
    x.combustivel = COMBUSTIVEIS.includes(v.ultimoCombustivel) ? v.ultimoCombustivel : '';
    // Tudo começa em OK; o que estava com X na FR anterior volta com X (e a descrição).
    // O funcionário troca para OK se já foi consertado.
    x.checklist = F.checklistTudoOk();
    x.defeitosItens = {};
    (v.defeitosAbertos || []).filter(d => F.ehDefeito(d.id)).forEach(d => {
      x.checklist[d.id] = 'x';
      if (d.descricao) x.defeitosItens[d.id] = d.descricao;
    });
  }

  // Aviso nos itens que vieram com X da FR anterior
  function pendentesDoVeiculo() {
    const v = veiculo(fr().veiculoId);
    const pend = {};
    ((v && v.defeitosAbertos) || []).filter(d => F.ehDefeito(d.id)).forEach(d => {
      pend[d.id] = `Veio com X da FR anterior (desde ${d.desde ? F.dataCurta(d.desde) : 'antes'}). Se já foi consertado, toque em OK.`;
    });
    return pend;
  }

  function passoSaida(caixa) {
    const x = fr();
    const v = veiculo(x.veiculoId);
    if (!x.partida_hora) x.partida_hora = F.agora();
    const m = M();
    const origem = v && v.ultimoKm != null
      ? `Último retorno registrado: <b>${escapar(m.texto(v.ultimoKm))} ${m.un}</b>${v.ultimoCondutor ? `, por ${escapar(primeiroNome(v.ultimoCondutor))}` : ''}${v.ultimaFrEm ? ` em ${escapar(dataTs(v.ultimaFrEm))}` : ''}.`
      : `Este veículo ainda não tem ${m.nome} registrado no app.`;
    caixa.innerHTML = `<h2 class="titulo-tela">Saída</h2>
      <div class="cartao cartao-solto">
        <label class="campo"><span>${m.horimetro ? 'Horímetro agora' : 'Km no hodômetro agora'}</span><input id="csKm" inputmode="${m.teclado}" value="${escapar(x.partida_km || '')}"></label>
        <p class="dica">${origem}</p>
        <p class="aviso" id="csDiverge" hidden></p>
        <div class="campo"><span>Combustível</span>
          <div class="segmentos" id="csComb">${COMBUSTIVEIS.map(c => `<button type="button" data-valor="${c}" class="${x.combustivel === c ? 'ativo' : ''}">${c === 'cheio' ? 'Cheio' : c}</button>`).join('')}</div>
        </div>
        <div class="grade">
          <label class="campo"><span>Horário de saída</span><input id="csHora" type="time" value="${escapar(x.partida_hora)}"></label>
          <label class="campo"><span>Horário na portaria</span><span class="hora"><input id="csPortaria" type="time" value="${escapar(x.portaria_hora || '')}"><button type="button" class="agora" id="csPortariaAgora">Agora</button></span></label>
        </div>
        ${v && alertaRevisao(v) ? `<p class="aviso">${escapar(alertaRevisao(v))}. Avise o ADM.</p>` : ''}
        ${v && F.alertaLicenciamento(v) ? `<p class="aviso">${escapar(F.alertaLicenciamento(v).texto)}. Avise o ADM.</p>` : ''}
      </div>`;
    const conferir = () => {
      const esp = m.ler(x.kmEsperado), inf = m.ler(x.partida_km);
      const el = $('#csDiverge');
      el.hidden = esp == null || inf == null || esp === inf;
      if (!el.hidden) el.textContent = inf > esp
        ? `Diferença de ${m.texto(inf - esp)} ${m.un} desde o último registro. O ADM será avisado de que o veículo ${m.horimetro ? 'trabalhou' : 'rodou'} sem FR no app.`
        : `O ${m.nome} está ${m.texto(esp - inf)} ${m.un} menor que o último registro. Confira.`;
    };
    $('#csKm').addEventListener('input', e => { x.partida_km = e.target.value.trim(); conferir(); F.salvarLocal(); });
    $('#csHora').addEventListener('input', e => { x.partida_hora = e.target.value; F.salvarLocal(); });
    $('#csPortaria').addEventListener('input', e => { x.portaria_hora = e.target.value; F.salvarLocal(); });
    $('#csPortariaAgora').addEventListener('click', () => { x.portaria_hora = $('#csPortaria').value = F.agora(); F.salvarLocal(); });
    $('#csComb').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      x.combustivel = b.dataset.valor;
      $$('#csComb button').forEach(o => o.classList.toggle('ativo', o === b));
      F.salvarLocal();
    });
    conferir();
  }

  function dataTs(ts) {
    // Timestamp do banco ou a cópia guardada no celular ({ seconds })
    const d = ts && ts.toDate ? ts.toDate() : ts && ts.seconds ? new Date(ts.seconds * 1000) : null;
    return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  }

  function passoInspecao(caixa) {
    const pend = pendentesDoVeiculo();
    caixa.innerHTML = `<h2 class="titulo-tela">Antes de ligar o veículo</h2>
      <p class="dica">Vem em <b>OK</b>, menos o que estava com X na FR anterior. Toque em <b>X</b> no que estiver com problema e, se puder, descreva. Os itens "durante" e "após" ficam para o fim do dia.</p>
      <div class="cartao cartao-solto" id="ciLista"></div>`;
    global.FrChecklist.render($('#ciLista'), { grupos: [0], pendentes: pend, aoMudar: F.salvarLocal });
  }

  function passoServico(caixa) {
    const x = fr();
    caixa.innerHTML = `<h2 class="titulo-tela">Serviço do dia</h2>
      <div class="cartao cartao-solto">
        <label class="campo"><span>O que vai ser feito e onde</span><textarea id="cdDescricao" rows="4" autocapitalize="sentences">${escapar(x.descricao || '')}</textarea></label>
        <small class="medidor" id="cdMedidor"></small>
        ${F.descricoesRecentes().length ? '<p class="dica">Usadas antes (toque para repetir):</p>' : ''}
        ${chipsHtml(F.descricoesRecentes(), 'data-desc')}
      </div>`;
    const medir = () => {
      const r = global.FrPdf.medir('descricao', x.descricao || '');
      const el = $('#cdMedidor');
      el.textContent = r && (x.descricao || '').trim() ? (r.cabe ? `${r.usadas} de ${r.total} linhas da FR` : `Não cabe nas ${r.total} linhas da FR`) : '';
      el.classList.toggle('cheio', !!r && !r.cabe);
    };
    $('#cdDescricao').addEventListener('input', e => { x.descricao = e.target.value; medir(); F.salvarLocal(); });
    $$('[data-desc]', caixa).forEach(c => c.addEventListener('click', () => {
      x.descricao = $('#cdDescricao').value = c.dataset.desc;
      medir();
      F.salvarLocal();
    }));
    medir();
  }

  $('#btnComecarVoltar').addEventListener('click', () => {
    if (passo === inicioPasso) { F.estado.fr = antesDeComecar; F.salvarAgora(); inicio(); return; }
    global.FrAnim.transicao(() => { passo--; desenharPasso(); }, 'volta');
  });

  $('#btnComecarAvancar').addEventListener('click', async () => {
    const x = fr();
    if (passo === 1) {
      if (!x.partida_km) { F.avisar(`Digite o ${M().horimetro ? 'horímetro' : 'km do hodômetro'}`, 'erro'); return; }
      if (!x.combustivel) { F.avisar('Marque o nível do combustível', 'erro'); return; }
    }
    if (passo < PASSOS.length - 1) { global.FrAnim.transicao(() => { passo++; desenharPasso(); }, 'vem'); return; }
    if (!(x.descricao || '').trim()) { F.avisar('Descreva o serviço do dia', 'erro'); return; }
    const esp = M().ler(x.kmEsperado), inf = M().ler(x.partida_km);
    x.kmDivergente = esp != null && inf != null && esp !== inf;
    x.status = 'aberta';
    delete x._preparada;
    F.listaPreparadas = F.preparadas().filter(c => c.id !== x.id);
    F.lembrarDescricao(x.descricao);
    F.sincronizar();
    // A chave gira na ignição; na tela inicial o carro entra na pista
    await global.FrAnim.ignicao($('#btnComecarAvancar'));
    global.FrAnim.proxima('sobe');
    inicio();
    global.FrAnim.chegouNaPista();
    F.avisar('Bom trabalho! Registre cada parada pelos botões.');
  });

  // =====================================================================
  // Encerrar o dia
  // =====================================================================
  function abrirEncerrar() {
    const x = fr();
    const andando = emAndamento();
    if (!x.retorno_km) x.retorno_km = ultimoKm();
    x.retorno_hora = F.agora();
    if (!x.defeitosEditado) x.defeitos = F.textoDefeitos(x);
    $('#encerrar').innerHTML = `<h2 class="titulo-tela">Encerrar o dia</h2>
      ${andando ? `<p class="aviso">A parada "${escapar(andando.local)}" está sem chegada. A chegada dela vai ser o retorno.</p>` : ''}
      <div class="cartao cartao-solto">
        <div class="grade">
          <label class="campo"><span>${M().Nome} no retorno</span><input id="ceKm" inputmode="${M().teclado}" value="${escapar(x.retorno_km)}"></label>
          <label class="campo"><span>Horário</span><input id="ceHora" type="time" value="${escapar(x.retorno_hora)}"></label>
        </div>
        <p class="dica" id="ceRodado"></p>
      </div>
      <div class="cartao cartao-solto" id="ceChecklist"></div>
      <div class="cartao cartao-solto">
        <label class="campo"><span>Defeitos / Avarias</span><textarea id="ceDefeitos" rows="3" autocapitalize="sentences" placeholder="Nenhum">${escapar(x.defeitos || '')}</textarea></label>
        <p class="dica">Vem com o que você escreveu nos itens marcados com X. Pode completar.</p>
        <label class="campo"><span>Ocorrências do dia</span><textarea id="ceOcorrencias" rows="3" autocapitalize="sentences" placeholder="Nenhuma">${escapar(x.ocorrencias || '')}</textarea></label>
      </div>`;
    const rodado = () => {
      const m = M();
      const a = m.ler(x.partida_km), b = m.ler(x.retorno_km);
      $('#ceRodado').textContent = a != null && b != null
        ? (b < a ? `Atenção: menor que o ${m.nome} de partida (${m.texto(a)}).` : `${m.horimetro ? 'Trabalhado' : 'Rodado'} no dia: ${m.texto(b - a)} ${m.un}`) : '';
    };
    $('#ceKm').addEventListener('input', e => { x.retorno_km = e.target.value.trim(); rodado(); F.salvarLocal(); });
    $('#ceHora').addEventListener('input', e => { x.retorno_hora = e.target.value; F.salvarLocal(); });
    $('#ceDefeitos').addEventListener('input', e => { x.defeitos = e.target.value; x.defeitosEditado = true; F.salvarLocal(); });
    $('#ceOcorrencias').addEventListener('input', e => { x.ocorrencias = e.target.value; F.salvarLocal(); });
    global.FrChecklist.render($('#ceChecklist'), {
      grupos: [1, 2],
      pendentes: pendentesDoVeiculo(),
      aoMudar: () => {
        if (!x.defeitosEditado) $('#ceDefeitos').value = x.defeitos = F.textoDefeitos(x);
        F.salvarLocal();
      },
    });
    rodado();
    F.mostrarTela('encerrar');
  }

  $('#btnEncerrar').addEventListener('click', async () => {
    const x = fr();
    const m = M();
    if (!x.retorno_km) { F.avisar(`Digite o ${m.nome} do retorno`, 'erro'); return; }
    const a = m.ler(x.partida_km), b = m.ler(x.retorno_km);
    if (a != null && b != null && b < a) { await F.kmMenor(m, a, b, 'da saída do dia'); return; }
    if (a != null && b != null && b - a > (m.horimetro ? 24 : 800)
      && !(await F.confirmar(`Conferir o ${m.nome}`, `Foram ${m.texto(b - a)} ${m.un} no dia. Está certo?`, 'Está certo', false))) return;
    const falta = global.FrChecklist.faltando([1, 2]);
    if (falta && !(await F.confirmar('Inspeção incompleta', `${falta} ${falta === 1 ? 'item ficou' : 'itens ficaram'} sem OK ou X. Encerrar assim mesmo?`, 'Encerrar', false))) return;

    // Antes de salvar, o funcionário confere a FR como vai ficar (Editar volta para esta tela)
    const previa = encerrada(JSON.parse(JSON.stringify(x)));
    F.verFr(previa, {
      titulo: 'Confira a sua FR',
      texto: 'Está tudo certo? Toque em Salvar para encerrar o dia.',
      acoes: [
        { rotulo: 'Editar', fn: () => {} },
        { rotulo: 'Salvar', principal: true, fn: () => {
          const andando = emAndamento();
          if (andando) F.lembrarLocal(andando.local);
          const y = encerrada(fr());
          F.sincronizar();
          inicio();
          const m = M(), a = m.ler(y.partida_km), b = m.ler(y.retorno_km);
          global.FrAnim.pare({ km: a != null && b != null && b >= a ? b - a : null, paradas: y.itinerario.length, un: m.un, enviada: navigator.onLine !== false })
            .then(() => F.avisar('FR salva. Bom descanso!'));
        } },
      ],
    });
  });

  // A FR como fica ao encerrar: a parada sem chegada termina no retorno, defeitos marcados com X
  function encerrada(x) {
    const it = x.itinerario || [];
    const andando = it.length && !it[it.length - 1].chegada_hora ? it[it.length - 1] : null;
    if (andando) { andando.chegada_km = x.retorno_km; andando.chegada_hora = x.retorno_hora; }
    x.status = 'fechada';
    // Defeito que já estava aberto mantém a data em que apareceu
    const antes = {};
    ((veiculo(x.veiculoId) || {}).defeitosAbertos || []).forEach(d => { antes[d.id] = d.desde; });
    x.defeitosAbertos = F.ITENS.filter(it2 => x.checklist[it2.id] === 'x' && F.ehDefeito(it2.id))
      .map(it2 => ({ id: it2.id, nome: it2.nome, descricao: (x.defeitosItens || {})[it2.id] || '', desde: antes[it2.id] || x.data }));
    return x;
  }

  global.FrDia = { inicio, alertaRevisao };
})(window);
