// FR - área do ADM: funcionários (RGF por celular), cadastro de veículos e FRs enviadas.

(function (global) {
  const F = global.FR;
  const { $, $$, escapar } = F;
  const A = () => global.FrDb.adm;

  let aba = 'frota';
  let funcionarios = [];
  let veiculos = [];
  let frs = null;
  let filtroFrs = 'todas';
  let pararFunc = null, pararVeic = null, pararLocais = null, pararFrota = null;
  let ativas = [];
  let filtroFrota = 'todos';
  let locais = [];
  let buscaLocal = '';

  function quando(ts) {
    const d = ts && ts.toDate ? ts.toDate() : null;
    return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  }

  function abrir() {
    if (!pararFunc) pararFunc = A().observarFuncionarios(l => { funcionarios = l; contador(); if (aba === 'funcionarios') desenhar(); });
    if (!pararVeic) pararVeic = A().observarVeiculos(l => { veiculos = l; contadorVeiculos(); if (aba === 'frota') desenhar(); });
    if (!pararLocais) pararLocais = A().observarLocais(l => { locais = l; if (aba === 'locais') listarLocais(); });
    if (!pararFrota) pararFrota = A().observarFrsAtivas(l => { ativas = l; if (aba === 'frota') desenhar(); });
    $$('#abasAdm [data-aba]').forEach(x => x.classList.toggle('ativa', x.dataset.aba === aba));
    F.mostrarTela('adm');
    desenhar();
    limpar();
  }

  // Uma vez por dia: FRs encerradas/canceladas abertas há mais de 30 dias saem do banco
  function limpar() {
    if (F.ler('fr.limpeza.v2', '') === F.hoje()) return;
    F.gravar('fr.limpeza.v2', F.hoje());
    A().limparAntigas().then(n => { if (n) console.info('[adm] FRs antigas apagadas:', n); })
      .catch(e => console.warn('[adm] limpeza', e.code || e));
  }

  function fechar() {
    if (pararFunc) { pararFunc(); pararFunc = null; }
    if (pararVeic) { pararVeic(); pararVeic = null; }
    if (pararLocais) { pararLocais(); pararLocais = null; }
    if (pararFrota) { pararFrota(); pararFrota = null; }
    frs = null;
  }

  $('#abasAdm').addEventListener('click', e => {
    const b = e.target.closest('[data-aba]');
    if (!b) return;
    aba = b.dataset.aba;
    $$('#abasAdm [data-aba]').forEach(x => x.classList.toggle('ativa', x === b));
    desenhar();
  });

  function contador() {
    const n = funcionarios.filter(f => precisaAtencao(f)).length;
    const el = $('#contFunc');
    el.hidden = !n;
    el.textContent = n;
  }

  // Veículos com licenciamento vencendo (30 dias) ou vencido
  function contadorVeiculos() {
    const n = veiculos.filter(v => F.alertaLicenciamento(v)).length;
    const el = $('#contVeic');
    el.hidden = !n;
    el.textContent = n;
  }

  // Pedido de liberação, cadastro esperando aprovação ou celular novo que o ADM ainda não viu
  const precisaAtencao = f => f.pedidoUid || (f.uid && f.aprovado === false) || (f.uid && f.visto === false);

  function desenhar() {
    ({ frota: desenharFrota, funcionarios: desenharFuncionarios, frs: desenharFrs, locais: desenharLocais })[aba]($('#adm'));
  }

  // ---------- controle de frota ----------
  // Cada veículo com a situação de agora: em serviço (FR aberta), preparada, livre; e o que pede atenção
  const ultimoKmFr = f => {
    const it = f.itinerario || [];
    for (let i = it.length - 1; i >= 0; i--) { if (it[i].chegada_km) return it[i].chegada_km; if (it[i].saida_km) return it[i].saida_km; }
    return f.partida_km || '';
  };
  function situacao(v) {
    const fr = ativas.find(f => f.veiculoId === v.id && f.status === 'aberta') || ativas.find(f => f.veiculoId === v.id && f.status === 'preparada');
    const m = F.medidor(v);
    const alertas = [];
    const lic = F.alertaLicenciamento(v);
    if (lic) alertas.push(lic.texto);
    const rev = global.FrDia.alertaRevisao(v);
    if (rev) alertas.push(rev);
    const d = v.defeitosAbertos || [];
    if (d.length) alertas.push(d.length === 1 ? `${d[0].nome} com problema` : `${d.length} defeitos abertos`);
    const s = { v, fr, alertas, m, km: v.ultimoKm != null ? `${m.grande(v.ultimoKm)} ${m.un}` : '—' };
    if (fr && fr.status === 'aberta') {
      const it = fr.itinerario || [];
      const u = it[it.length - 1];
      const andando = u && !u.chegada_hora;
      const k = m.ler(ultimoKmFr(fr));
      s.grupo = 'servico';
      s.status = andando ? `Em serviço · ${it.length}ª parada` : 'Em serviço';
      s.cor = 'servico';
      s.quem = fr.condutor;
      s.detalhe = `Saiu ${fr.partida_hora || '--:--'}` + (andando ? ` · a caminho de ${u.local || 'parada'}` : ` · ${it.length} ${it.length === 1 ? 'parada' : 'paradas'}`);
      if (k != null) s.km = `${m.grande(k)} ${m.un}`;
    } else if (fr) {
      s.grupo = 'servico';
      s.status = 'Preparada · aguardando';
      s.cor = 'preparada';
      s.quem = fr.condutor;
      s.detalhe = `Preparada por ${fr.preparadaPor ? fr.preparadaPor.nome : 'chefe'}${F.dataCurta(fr.data) && fr.data !== F.hoje() ? ' para ' + F.dataCurta(fr.data) : ''}`;
    } else {
      s.grupo = 'livre';
      s.status = alertas.length ? 'Parado · atenção' : 'Livre';
      s.cor = alertas.length ? 'atencao' : 'livre';
      s.quem = v.ultimoCondutor ? `Último: ${v.ultimoCondutor}` : 'Sem FR no app ainda';
      s.detalhe = v.ultimaFrEm ? `Devolvido ${quando(v.ultimaFrEm)}` : '';
    }
    return s;
  }

  function desenharFrota(caixa) {
    const todas = veiculos.filter(v => v.ativo !== false).map(situacao);
    const n = g => todas.filter(g).length;
    const FILTROS = {
      todos: () => true, servico: s => s.grupo === 'servico', livre: s => s.grupo === 'livre', atencao: s => s.alertas.length,
    };
    const lista = todas.filter(FILTROS[filtroFrota])
      .sort((a, b) => (a.grupo === b.grupo ? 0 : a.grupo === 'servico' ? -1 : 1) || (b.alertas.length - a.alertas.length));
    const agora = new Date().toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    caixa.innerHTML = `<div class="frota-cab"><div><h2 class="titulo-tela">Frota</h2><span class="dica">${escapar(agora)}</span></div></div>
      <button type="button" class="fab" data-acao="novo-veiculo">${F.ic('mais')}<span>Veículo</span></button>
      <div class="filtros">${[['todos', 'Todos'], ['servico', 'Em serviço'], ['livre', 'Livres'], ['atencao', 'Atenção']].map(([k, r]) =>
        `<button type="button" class="filtro${filtroFrota === k ? ' ativo' : ''}${k === 'atencao' && n(FILTROS[k]) ? ' filtro-alerta' : ''}" data-frota-filtro="${k}">${r} <b>${n(FILTROS[k])}</b></button>`).join('')}</div>
      <div class="grade-cartoes">` +
      (lista.length ? lista.map(s => `<button type="button" class="cartao cartao-solto frota-item" data-frota="${escapar(s.v.id)}">
          <div class="frota-linha"><span class="veic-id">${F.iconeVeiculo(s.v)}${F.placaHtml(s.v)}</span><span class="frota-nome"><b>${escapar([s.v.marca, s.v.modelo].filter(Boolean).join(' ') || 'Veículo')}</b>
            <small class="status-${s.cor}">${escapar(s.status)}</small></span></div>
          <div class="frota-linha frota-baixo"><span><b>${escapar(s.quem)}</b><small>${escapar(s.detalhe)}</small></span><b class="frota-km">${escapar(s.km)}</b></div>
          ${s.alertas.length ? `<p class="txt-erro">${escapar(s.alertas.join(' · '))}</p>` : ''}
        </button>`).join('') : `<div class="vazio"><p>${veiculos.length ? 'Nenhum veículo aqui.' : 'Nenhum veículo cadastrado.'}</p></div>`) + '</div>';
    $$('[data-frota-filtro]', caixa).forEach(c => c.addEventListener('click', () => { filtroFrota = c.dataset.frotaFiltro; desenhar(); }));
    $$('[data-frota]', caixa).forEach(b => b.addEventListener('click', () => detalheFrota(situacao(veiculos.find(v => v.id === b.dataset.frota)))));
  }

  function detalheFrota(s) {
    const { v, fr, m } = s;
    let html = `<div class="frota-linha"><span class="veic-id">${F.iconeVeiculo(v)}${F.placaHtml(v)}</span><span class="frota-nome"><b>${escapar([v.marca, v.modelo].filter(Boolean).join(' '))}</b><small>${escapar(s.quem)}</small></span></div>`;
    if (fr && fr.status === 'aberta') {
      const a = m.ler(fr.partida_km), b = m.ler(ultimoKmFr(fr));
      html += `<div class="numeros"><div><small>Saiu</small><b>${escapar(fr.partida_hora || '--:--')}</b></div>
          <div><small>${m.Nome} agora</small><b>${b != null ? escapar(m.grande(b)) : '—'}</b></div>
          <div><small>${m.horimetro ? 'Trabalhado' : 'Rodado'}</small><b>${a != null && b != null ? escapar(m.texto(b - a)) + ' ' + m.un : '—'}</b></div></div>
        ${(fr.itinerario || []).length ? `<h3 class="secao">Paradas</h3><ol class="paradas-curtas">${fr.itinerario.map((p, i) =>
          `<li><b>${i + 1} · ${escapar(p.local || 'Parada')}</b><span>${p.chegada_hora ? `${escapar(p.saida_hora)} → ${escapar(p.chegada_hora)}` : `saiu ${escapar(p.saida_hora)} · a caminho`}</span></li>`).join('')}</ol>` : '<p class="dica">Nenhuma parada ainda.</p>'}`;
    } else if (fr) {
      html += `<p class="dica">${escapar(s.detalhe)}. Esperando ${escapar(fr.condutor)} começar.</p>`;
    } else {
      html += `<p class="dica">${escapar(s.detalhe || 'Sem FR em andamento.')} · ${escapar(s.km)}</p>`;
    }
    if (fr) html += `<div class="acoes"><button type="button" class="link" data-fd="pdf">${F.ic('pdf')}Ver PDF</button>
        <button type="button" class="link" data-fd="corrigir">${F.ic('editar')}Corrigir</button>
        <button type="button" class="link" data-fd="trocar">${F.ic('passar')}Passar</button></div>`;
    // Cadastro do veículo (o que era a aba Veículos)
    const lic = F.alertaLicenciamento(v);
    const rev = global.FrDia.alertaRevisao(v);
    html += `<h3 class="secao">Veículo</h3>
      <p class="dica">Tombamento ${escapar(v.tombamento || '—')}${m.horimetro ? ' · Máquina (horímetro)' : ''} · ${v.ultimoKm != null ? `${escapar(m.grande(v.ultimoKm))} ${m.un}` : `sem ${m.nome}`}${v.revisaoKm ? ` · revisão em ${escapar(m.texto(v.revisaoKm))} ${m.un}` : ''}</p>
      ${rev ? `<p class="txt-aviso">${escapar(rev)}</p>` : ''}
      ${v.licenciamentoVence ? `<p class="${lic ? (lic.vencido ? 'txt-erro' : 'txt-aviso') : 'dica'}">${lic ? escapar(lic.texto) : `Licenciamento vence em ${escapar(F.dataCurta(v.licenciamentoVence))}`}</p>` : ''}
      ${(v.defeitosAbertos || []).map(d => `<div class="defeito"><span>${escapar(d.nome)}${d.descricao ? `: ${escapar(d.descricao)}` : ''}<small>desde ${escapar(F.dataCurta(d.desde))}</small></span>
        <button type="button" class="link" data-baixa="${escapar(d.id)}">Dar baixa</button></div>`).join('')}
      <div class="acoes"><button type="button" class="link" data-fd="editar-veiculo">${F.ic('editar')}Editar veículo</button>
        <button type="button" class="link link-perigo" data-fd="excluir-veiculo">${F.ic('excluir')}Excluir veículo</button></div>`;
    F.folhaForm({
      titulo: fr ? (fr.status === 'aberta' ? 'Em serviço' : 'FR preparada') : s.status,
      botao: 'Fechar',
      semCancelar: true,
      html,
      aoAbrir: corpo => {
        $$('[data-baixa]', corpo).forEach(b => b.addEventListener('click', async () => {
          await acaoVeiculo('baixa', v, b.dataset.baixa);
          b.closest('.defeito').remove();
          F.avisar('Defeito baixado');
        }));
        $$('[data-fd]', corpo).forEach(b => b.addEventListener('click', () => {
        F.fecharFolha('folhaForm');
        if (b.dataset.fd === 'editar-veiculo') setTimeout(() => formVeiculo(v), 50);
        if (b.dataset.fd === 'excluir-veiculo') setTimeout(() => acaoVeiculo('excluir-veiculo', v), 50);
        if (b.dataset.fd === 'pdf') verPdfAdm(fr);
        if (b.dataset.fd === 'corrigir') corrigirFr(fr);
        if (b.dataset.fd === 'trocar') setTimeout(() => formTrocar(fr), 50);
        }));
      },
      aoOk: () => {},
    });
  }

  // ---------- funcionários ----------
  function desenharFuncionarios(caixa) {
    const pendentes = funcionarios.filter(f => (f.uid && f.aprovado === false) || f.pedidoUid)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const time = funcionarios.filter(f => !pendentes.includes(f))
      .sort((a, b) => (b.papel === 'chefe') - (a.papel === 'chefe') || (a.nome || '').localeCompare(b.nome || ''));
    const novos = time.filter(f => f.uid && f.visto === false).length;
    // Pedidos esperando o ADM: cartão largo, com os dois botões à vista
    const pedido = f => {
      const pendente = f.uid && f.aprovado === false;
      const titulo = pendente ? 'Pediu acesso ao app'
        : f.pedidoMotivo === 'trocar_rgf' ? 'Quer trocar o RGF do celular dele' : 'Pediu para usar este RGF em outro celular';
      return `<div class="cartao pedido-cartao" data-rgf="${escapar(f.rgf)}">
        <div class="pessoa-linha">${F.iconePessoa(f.papel === 'chefe')}<span><b>${escapar(f.nome)}</b><small>RGF ${escapar(f.rgf)} · ${escapar(f.cargo || '')}</small></span></div>
        <div class="pedido"><b>${titulo}</b><small>${escapar(quando(pendente ? f.vinculadoEm : f.pedidoEm))}</small></div>
        <div class="barra-dupla"><button type="button" class="btn btn-claro" data-acao="${pendente ? 'recusar-cadastro' : 'recusar'}">${F.ic('cancelar')}Recusar</button>
          <button type="button" class="btn btn-principal" data-acao="${pendente ? 'aprovar' : 'liberar'}">${F.ic('salvar')}${pendente ? 'Aprovar' : 'Liberar'}</button></div>
      </div>`;
    };
    // Cada pessoa: figura, nome, RGF/cargo e a situação; tocar abre as opções
    const pessoa = f => {
      const situacao = !f.uid ? ['sem', 'Ainda não entrou'] : f.visto === false ? ['novo', 'Celular novo'] : ['ok', 'Usando o app'];
      return `<button type="button" class="cartao pessoa" data-pessoa="${escapar(f.rgf)}">
        ${F.iconePessoa(f.papel === 'chefe')}
        <b>${escapar(f.nome)}</b>
        <small>RGF ${escapar(f.rgf)}${f.cargo ? ' · ' + escapar(f.cargo) : ''}</small>
        <span class="pessoa-sit sit-${situacao[0]}">${situacao[1]}</span>
        ${f.papel === 'chefe' ? '<span class="selo selo-chefe pessoa-selo">Chefe</span>' : ''}
      </button>`;
    };
    caixa.innerHTML = `<div class="frota-cab"><div><h2 class="titulo-tela">Equipe</h2><span class="dica">${time.length} ${time.length === 1 ? 'pessoa' : 'pessoas'}${novos ? ` · ${novos} com celular novo` : ''}</span></div></div>
      <button type="button" class="fab" data-acao="novo-func">${F.ic('mais')}<span>Funcionário</span></button>
      ${pendentes.length ? `<h3 class="secao">Esperando você</h3><div class="grade-pedidos">${pendentes.map(pedido).join('')}</div>` : ''}
      <h3 class="secao">Todos</h3>
      ${time.length ? `<div class="grade-pessoas">${time.map(pessoa).join('')}</div>` : '<div class="vazio"><p>Nenhum funcionário ainda.</p></div>'}
      <p class="dica">Quem você cadastra aqui só digita o RGF no app e já entra. Quem não está na lista pede acesso e espera você aprovar.</p>`;
    $$('[data-pessoa]', caixa).forEach(b => b.addEventListener('click', () => {
      const f = funcionarios.find(x => x.rgf === b.dataset.pessoa);
      if (!f) return;
      const situacao = f.uid ? `Usando o app desde ${quando(f.vinculadoEm)}` : 'Cadastrado: ainda não entrou no app';
      F.menuAcoes(f.nome, `RGF ${f.rgf} · ${f.cargo || ''} · ${situacao}`, [
        f.uid && f.visto === false && { rotulo: 'Ciente do celular novo', icone: 'salvar', fn: () => acaoFuncionario('ciente', f) },
        { rotulo: 'Editar', icone: 'editar', fn: () => acaoFuncionario('editar-func', f) },
        f.uid && { rotulo: 'Desvincular celular', icone: 'trocar', fn: () => acaoFuncionario('desvincular', f) },
        { rotulo: 'Excluir', icone: 'excluir', perigo: true, fn: () => acaoFuncionario('excluir', f) },
      ]);
    }));
  }

  // Tamanho máximo dos campos do veículo (cabem no quadro do papel e nos cartões)
  const LIMITE = { tombamento: 20, marca: 30, modelo: 40, placa: 8 };

  function formFuncionario(f) {
    F.folhaForm({
      titulo: f ? 'Editar funcionário' : 'Cadastrar funcionário',
      botao: 'Salvar',
      html: `<label class="campo"><span>RGF</span><input data-c="rgf" inputmode="numeric" autocomplete="off" value="${escapar(f ? f.rgf : '')}" ${f ? 'disabled' : ''}></label>
        <label class="campo"><span>Nome completo</span><input data-c="nome" autocapitalize="words" maxlength="60" value="${escapar(f ? f.nome : '')}"></label>
        <label class="campo"><span>Cargo / Função</span><input data-c="cargo" autocapitalize="words" maxlength="40" value="${escapar(f ? f.cargo : '')}"></label>
        <label class="marcar marcar-caixa"><input type="checkbox" data-c="chefe" ${f && f.papel === 'chefe' ? 'checked' : ''}>
          <span><b>Chefe</b><small>Vê as FRs da equipe, prepara FRs para os funcionários e imprime as do dia.</small></span></label>`,
      aoOk: async corpo => {
        const v = c => $(`[data-c="${c}"]`, corpo).value.trim().replace(/\s+/g, ' ');
        const dados = { rgf: v('rgf').replace(/\D/g, ''), nome: v('nome'), cargo: v('cargo'), papel: $('[data-c="chefe"]', corpo).checked ? 'chefe' : '' };
        if (dados.rgf.length < 3 || !dados.nome || !dados.cargo) { F.avisar('Preencha RGF, nome e cargo', 'erro'); return false; }
        if (!f && funcionarios.some(x => x.rgf === dados.rgf)) { F.avisar('Este RGF já está na lista', 'erro'); return false; }
        try { await A().salvarFuncionario(dados); F.avisar('Funcionário salvo'); }
        catch (err) { F.avisar('Não foi possível salvar: ' + err.message, 'erro'); return false; }
      },
    });
  }

  $('#adm').addEventListener('click', async e => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const card = b.closest('[data-rgf]');
    if (card) return acaoFuncionario(b.dataset.acao, funcionarios.find(f => f.rgf === card.dataset.rgf));
    const vc = b.closest('[data-veiculo]');
    if (vc) return acaoVeiculo(b.dataset.acao, veiculos.find(v => v.id === vc.dataset.veiculo), b.dataset.defeito);
    if (b.dataset.acao === 'novo-veiculo') return formVeiculo(null);
    if (b.dataset.acao === 'novo-func') return formFuncionario(null);
  });

  async function acaoFuncionario(acao, f) {
    if (!f) return;
    try {
      if (acao === 'ciente') await A().marcarVisto(f.rgf);
      if (acao === 'editar-func') formFuncionario(f);
      if (acao === 'aprovar') { await A().aprovar(f.rgf); F.avisar(`${f.nome} aprovado`); }
      if (acao === 'recusar-cadastro' && await F.confirmar('Recusar o acesso?', `O pedido de ${f.nome} (RGF ${f.rgf}) será apagado.`, 'Recusar')) {
        await A().excluirFuncionario(f.rgf);
      }
      if (acao === 'recusar') await A().recusarPedido(f.rgf);
      if (acao === 'liberar') {
        // Trocar o RGF do próprio celular = soltar o RGF; outro celular = passar o RGF para ele
        if (f.pedidoMotivo === 'trocar_rgf') await A().desvincular(f.rgf);
        else await A().liberarPedido(f);
        F.avisar('Liberado');
      }
      if (acao === 'desvincular' && await F.confirmar('Desvincular celular?', `O RGF ${f.rgf} (${f.nome}) fica livre. O próximo celular que digitar esse RGF passa a ser o dele.`, 'Desvincular')) {
        await A().desvincular(f.rgf);
      }
      if (acao === 'excluir' && await F.confirmar('Excluir funcionário?', `${f.nome} (RGF ${f.rgf}) sai da lista. As FRs dele continuam salvas.`, 'Excluir')) {
        await A().excluirFuncionario(f.rgf);
      }
    } catch (err) {
      F.avisar('Não foi possível: ' + err.message, 'erro');
    }
  }

  // ---------- veículos (cadastro; a lista fica na aba Frota) ----------
  async function acaoVeiculo(acao, v, defeitoId) {
    if (!v) return;
    try {
      if (acao === 'editar') formVeiculo(v);
      if (acao === 'baixa') await A().darBaixaDefeito(v.id, (v.defeitosAbertos || []).filter(d => d.id !== defeitoId));
      if (acao === 'excluir-veiculo' && await F.confirmar('Excluir veículo?', `${v.modelo || ''} ${v.placa || ''} sai da lista dos funcionários.`, 'Excluir')) {
        await A().excluirVeiculo(v.id);
      }
    } catch (err) {
      F.avisar('Não foi possível: ' + err.message, 'erro');
    }
  }

  const CAMPOS_VEICULO = [
    ['tombamento', 'Tombamento', ''], ['marca', 'Marca', ''],
    ['modelo', 'Modelo', ''], ['placa', 'Placa', ''], ['ultimoKm', '{M} atual', 'medida'], ['revisaoKm', 'Próxima revisão ({u})', 'medida'],
  ];

  function formVeiculo(v) {
    let medidor = v && v.medidor === 'horimetro' ? 'horimetro' : 'km';
    let tipo = v ? F.tipoVeiculo(v) : 'carro';
    const rotulo = r => r.replace('{M}', F.medidor({ medidor }).Nome).replace('{u}', F.medidor({ medidor }).un);
    const valor = c => {
      if (!v || v[c] == null) return '';
      return ['ultimoKm', 'revisaoKm'].includes(c) ? F.medidor(v).texto(v[c]) : v[c];
    };
    F.folhaForm({
      titulo: v ? 'Editar veículo' : 'Novo veículo',
      botao: 'Salvar',
      html: `<div class="campo"><span>Tipo</span>
          <div class="tipos-veiculo" id="fvTipo">${F.TIPOS_VEICULO.map(t => `<button type="button" data-tipo="${t.id}" class="${t.id === tipo ? 'ativo' : ''}">${t.svg}<small>${t.nome.replace(' (patrol)', '')}</small></button>`).join('')}</div></div>
        <div class="campo"><span>Mede por</span>
          <div class="segmentos" id="fvMedidor">
            <button type="button" data-valor="km" class="${medidor === 'km' ? 'ativo' : ''}">Km (veículo)</button>
            <button type="button" data-valor="horimetro" class="${medidor === 'horimetro' ? 'ativo' : ''}">Horímetro (máquina)</button>
          </div></div>
        <div class="grade">${CAMPOS_VEICULO.map(([c, r, m]) =>
        `<label class="campo"><span data-rotulo="${r}">${rotulo(r)}</span><input data-c="${c}" ${LIMITE[c] ? `maxlength="${LIMITE[c]}"` : ''} ${m === 'medida' ? `inputmode="${F.medidor({ medidor }).teclado}"` : m ? `inputmode="${m}"` : ''} autocomplete="off" value="${escapar(valor(c))}"></label>`).join('')}</div>
        <label class="campo"><span>Vencimento do licenciamento (opcional)</span><input data-c="licenciamentoVence" type="date" value="${escapar((v && v.licenciamentoVence) || '')}"></label>
        <p class="dica">Com a data, o app avisa o funcionário e o ADM a partir de 30 dias antes de vencer.</p>`,
      aoAbrir: corpo => {
        $('#fvTipo', corpo).addEventListener('click', e => {
          const b = e.target.closest('[data-tipo]');
          if (!b) return;
          tipo = b.dataset.tipo;
          $$('#fvTipo button', corpo).forEach(o => o.classList.toggle('ativo', o === b));
          // Máquina costuma medir por horímetro: já sugere (dá para trocar)
          const maquina = ['retro', 'patrol', 'trator', 'rolo'].includes(tipo);
          const alvo = $(`#fvMedidor [data-valor="${maquina ? 'horimetro' : 'km'}"]`, corpo);
          if (alvo && !alvo.classList.contains('ativo')) alvo.click();
        });
        $('#fvMedidor', corpo).addEventListener('click', e => {
          const b = e.target.closest('[data-valor]');
          if (!b) return;
          medidor = b.dataset.valor;
          $$('#fvMedidor button', corpo).forEach(o => o.classList.toggle('ativo', o === b));
          $$('[data-rotulo]', corpo).forEach(s => { s.textContent = rotulo(s.dataset.rotulo); });
          $$('[data-c="ultimoKm"], [data-c="revisaoKm"]', corpo).forEach(i => { i.inputMode = F.medidor({ medidor }).teclado; });
        });
      },
      aoOk: async corpo => {
        const dados = { id: v ? v.id : null, ativo: true, medidor, tipo };
        $$('[data-c]', corpo).forEach(i => { dados[i.dataset.c] = i.value.trim(); });
        if (!dados.placa && !dados.tombamento) { F.avisar('Informe a placa ou o tombamento', 'erro'); return false; }
        dados.placa = dados.placa.toUpperCase();
        ['ultimoKm', 'revisaoKm'].forEach(c => { dados[c] = F.medidor({ medidor }).ler(dados[c]); });
        if (!dados.id) delete dados.id;
        try { await A().salvarVeiculo(dados); F.avisar('Veículo salvo'); }
        catch (err) { F.avisar('Não foi possível salvar: ' + err.message, 'erro'); return false; }
      },
    });
  }

  // ---------- FRs ----------
  // Mesmo cartão e mesmo papel ao lado do chefe (frlista.js), com as ações do ADM
  function cartaoFrAdm(f) {
    const m = F.medidor(f);
    const a = m.ler(f.partida_km), b = m.ler(f.retorno_km || ultimoKmFr(f));
    const rodado = a != null && b != null ? `${m.texto(b - a)} ${m.un} ${m.horimetro ? 'trabalhadas' : 'rodados'}` : '';
    const paradas = (f.itinerario || []).length;
    const sit = {
      fechada: [f.fechadaAuto ? 'Fechou sozinha' : f.recebidaPor ? 'Papel recebido' : f.retorno_hora ? `Encerrada às ${f.retorno_hora}` : 'Encerrada', 'final',
        [f.partida_hora && f.retorno_hora ? `${f.partida_hora} às ${f.retorno_hora}` : '', rodado].filter(Boolean).join(' · ')],
      aberta: ['Em serviço', 'servico', [`Saída ${f.partida_hora || '--:--'}`, `${paradas} ${paradas === 1 ? 'parada' : 'paradas'}`, rodado].filter(Boolean).join(' · ')],
      preparada: ['Preparada', 'aguardando', f.preparadaPor ? `por ${f.preparadaPor.nome}` : ''],
      cancelada: ['Cancelada', 'atencao', ''],
    }[f.status] || ['Em serviço', 'servico', ''];
    const avisos = [];
    if (f.status !== 'cancelada') {
      if (f.kmDivergente) avisos.push(['txt-aviso', `${m.Nome} de partida ${f.partida_km} diferente do último registro (${f.kmEsperado})`]);
      if ((f.defeitosAbertos || []).length) avisos.push(['txt-erro', `${f.defeitosAbertos.length} defeito(s): ${f.defeitosAbertos.map(d => d.nome).join(', ')}`]);
      const sem = F.defeitosSemDescricao(f);
      if (sem.length) avisos.push(['txt-aviso', `X sem descrição: ${sem.join(', ')}. Confira com ${f.condutor} e corrija a FR.`]);
      if (f.status === 'aberta' && (f.compartilhadoCom || []).length) avisos.push(['dica', `Compartilhada com ${f.compartilhadoCom.map(c => c.nome).join(', ')}`]);
    }
    const acoes = [['pdf', 'Ver PDF'], ['editar', 'Corrigir']];
    if (f.status === 'aberta') acoes.push(['compartilhar', 'Compartilhar'], ['trocar', 'Trocar']);
    else if (f.status === 'preparada') acoes.push(['trocar', 'Trocar']);
    else acoes.push(['reabrir', 'Reabrir']);
    acoes.push(['excluir', 'Excluir', 'perigo']);
    return global.FrLista.cartao({
      f, titulo: `${F.dataCurta(f.data)} · ${f.condutor || ''}`, sub: [f.marca, f.modelo].filter(Boolean).join(' ') || 'Veículo',
      status: sit[0], classe: sit[1], detalhe: sit[2],
      km: f.status === 'aberta' && b != null ? `${m.grande(b)} ${m.un}` : '',
      selo: f.status === 'fechada' ? (f.impressaEm ? '<span class="selo selo-ok">Impressa</span>' : '<span class="selo">Não impressa</span>') : '',
      acoes, aviso: avisos.map(([c, t]) => `<p class="${c} aviso-cartao">${escapar(t)}</p>`).join(''),
    });
  }

  async function desenharFrs(caixa) {
    if (!frs) {
      caixa.innerHTML = '<div class="vazio"><div class="girando"></div><p>Carregando FRs…</p></div>';
      try { frs = await A().frs(); }
      catch (err) { caixa.innerHTML = `<p class="aviso">Não foi possível carregar: ${escapar(err.message)}</p>`; return; }
      if (aba !== 'frs') return;
    }
    const alerta = f => f.status !== 'cancelada' && (f.kmDivergente || (f.defeitosAbertos || []).length);
    const FILTROS = {
      todas: f => f.status !== 'cancelada',
      abertas: f => f.status === 'aberta' || f.status === 'preparada',
      alertas: alerta,
    };
    const lista = frs.filter(FILTROS[filtroFrs]);
    const n = k => frs.filter(FILTROS[k]).length;
    caixa.innerHTML = `<div class="filtros">
        ${[['todas', 'Todas'], ['abertas', 'Em serviço'], ['alertas', 'Com alerta']].map(([k, r]) =>
          `<button type="button" class="filtro${filtroFrs === k ? ' ativo' : ''}${k === 'alertas' && n(k) ? ' filtro-alerta' : ''}" data-filtro="${k}">${r} <b>${n(k)}</b></button>`).join('')}
        <button type="button" class="filtro" data-acao-lista="recarregar">Atualizar</button>
      </div>` + global.FrLista.painel(`<h3 class="secao">FRs dos últimos 30 dias</h3>` +
        (lista.length ? lista.map(cartaoFrAdm).join('') : '<div class="vazio"><p>Nenhuma FR aqui.</p></div>'));
    $$('[data-filtro]', caixa).forEach(c => c.addEventListener('click', () => { filtroFrs = c.dataset.filtro; desenhar(); }));
    $('[data-acao-lista="recarregar"]', caixa).addEventListener('click', () => { frs = null; desenhar(); });
    global.FrLista.ligar(caixa, lista, {
      acoes: {
        pdf: verPdfAdm, editar: corrigirFr, compartilhar: formCompartilhar, trocar: formTrocar,
        reabrir: async f => {
          const txt = `A FR de ${f.condutor} do dia ${F.dataCurta(f.data)} volta a ficar em serviço e aparece de novo no celular dele para continuar e encerrar.`;
          if (!(await F.confirmar('Liberar a FR de novo?', txt, 'Liberar', false))) return;
          try {
            await A().reabrirFr(f.id);
            f.status = 'aberta';
            desenhar();
            F.avisar('FR liberada');
          } catch (err) { F.avisar('Não foi possível: ' + err.message, 'erro'); }
        },
        excluir: async f => {
          const aviso = f.status === 'fechada' ? ' O km e os defeitos que ela gravou no veículo continuam como estão.' : '';
          if (!(await F.confirmar('Excluir esta FR?', `FR de ${f.condutor} do dia ${F.dataCurta(f.data)} será apagada do banco. Não dá para desfazer.${aviso}`, 'Excluir'))) return;
          try {
            await A().excluirFr(f.id);
            frs = frs.filter(x => x.id !== f.id);
            global.FrLista.fechar();
            desenhar();
            F.avisar('FR excluída');
          } catch (err) {
            F.avisar('Não foi possível excluir: ' + err.message, 'erro');
          }
        },
      },
      imprimir: f => F.imprimirVarias([f]).catch(err => F.avisar(err.message, 'erro')),
      verPdf: verPdfAdm,
    });
  }
  // O ADM vê qualquer FR e corrige de dentro do visor
  function verPdfAdm(f) {
    F.verPdf(f, { editar: f.status !== 'cancelada' && (() => corrigirFr(f)) });
  }

  // ---------- corrigir a FR de um funcionário (ficha completa) ----------
  function corrigirFr(f) {
    global.FrFicha.editarFr(f, { salvar: (x, antes) => A().salvarFrAdm(x, antes), voltar: abrir, veiculo: true });
  }

  // ---------- locais (sugestões do itinerário para todos) ----------
  function desenharLocais(caixa) {
    caixa.innerHTML = `<p class="dica">Locais que os funcionários já digitaram. Aparecem como sugestão para todos enquanto digitam.
        Corrija nomes escritos errado e apague os repetidos.</p>
      <label class="campo"><input id="buscaLocalAdm" placeholder="Buscar local" value="${escapar(buscaLocal)}"></label>
      <div id="listaLocaisAdm"></div>`;
    $('#buscaLocalAdm').addEventListener('input', e => { buscaLocal = e.target.value; listarLocais(); });
    listarLocais();
  }

  function listarLocais() {
    const caixa = $('#listaLocaisAdm');
    if (!caixa) return;
    const q = F.chaveLocal(buscaLocal);
    const lista = locais.filter(l => !q || F.chaveLocal(l.texto).includes(q))
      .sort((a, b) => (b.n || 0) - (a.n || 0) || (a.texto || '').localeCompare(b.texto || ''));
    caixa.innerHTML = lista.length ? lista.map(l => `<div class="cartao cartao-solto" data-local-id="${escapar(l.chave)}">
        <div class="linha-entre"><b>${escapar(l.texto)}</b><span class="selo selo-ok">${l.n || 0}×</span></div>
        <div class="acoes">
          <button type="button" class="link" data-local-acao="editar">Corrigir nome</button>
          <button type="button" class="link link-perigo" data-local-acao="excluir">Excluir</button>
        </div>
      </div>`).join('') : `<div class="vazio"><p>${locais.length ? 'Nenhum local com esse nome.' : 'Nenhum local ainda. Eles aparecem aqui conforme os funcionários registram as paradas.'}</p></div>`;
    $$('[data-local-acao]', caixa).forEach(b => b.addEventListener('click', async () => {
      const l = locais.find(x => x.chave === b.closest('[data-local-id]').dataset.localId);
      if (!l) return;
      if (b.dataset.localAcao === 'editar') {
        F.folhaForm({
          titulo: 'Corrigir nome do local',
          botao: 'Salvar',
          html: `<label class="campo"><span>Nome</span><input id="localNome" autocapitalize="words" maxlength="80" value="${escapar(l.texto)}"></label>`,
          aoOk: async () => {
            const texto = $('#localNome').value.trim().replace(/\s+/g, ' ');
            if (!texto) { F.avisar('Digite o nome', 'erro'); return false; }
            const chave = F.chaveLocal(texto);
            const certo = locais.find(x => x.chave !== l.chave && x.chave === chave);
            if (certo && !(await F.confirmar('Juntar os dois?', `"${certo.texto}" já existe. "${l.texto}" vai sumir e o uso dele passa para "${certo.texto}".`, 'Juntar', false))) return false;
            try { await A().renomearLocal(l, certo ? certo.texto : texto, chave, certo ? certo.n : 0); F.avisar(certo ? 'Locais juntados' : 'Local corrigido'); }
            catch (err) { F.avisar('Não foi possível: ' + err.message, 'erro'); return false; }
          },
        });
        return;
      }
      if (!(await F.confirmar('Excluir local?', `"${l.texto}" sai das sugestões. As FRs que já usaram esse local não mudam.`, 'Excluir'))) return;
      try { await A().excluirLocal(l); F.avisar('Local excluído'); }
      catch (err) { F.avisar('Não foi possível: ' + err.message, 'erro'); }
    }));
  }

  // Funcionários que já usam o app (o compartilhamento vai para o celular deles)
  const comCelular = () => funcionarios.filter(x => x.uid && x.aprovado).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  function escolhaFuncionarios(lista, marcados) {
    return lista.length
      ? `<div class="chips chips-quebra">${lista.map(x => `<button type="button" class="chip ${marcados.includes(x.rgf) ? 'ativo' : ''}" data-escolha="${escapar(x.rgf)}">${escapar(x.nome)}</button>`).join('')}</div>`
      : '<p class="aviso">Nenhum outro funcionário está usando o app.</p>';
  }
  function ligarEscolha(corpo, multiplo) {
    $$('[data-escolha]', corpo).forEach(c => c.addEventListener('click', () => {
      if (!multiplo) $$('[data-escolha]', corpo).forEach(o => { if (o !== c) o.classList.remove('ativo'); });
      c.classList.toggle('ativo');
    }));
  }
  const escolhidos = corpo => $$('[data-escolha].ativo', corpo).map(c => funcionarios.find(x => x.rgf === c.dataset.escolha)).filter(Boolean);

  // O ADM compartilha a FR de um funcionário com colegas (eles registram paradas como se fossem o dono)
  function formCompartilhar(f) {
    const lista = comCelular().filter(x => x.rgf !== f.rgf);
    F.folhaForm({
      titulo: 'Compartilhar a FR',
      botao: 'Salvar',
      html: `<p class="dica">FR de ${escapar(f.condutor)} (${escapar([f.modelo, f.placa].filter(Boolean).join(' · '))}). Quem for marcado registra paradas nela pelo próprio celular; o PDF continua no nome de ${escapar(f.condutor)}.</p>
        ${escolhaFuncionarios(lista, (f.compartilhadoCom || []).map(c => c.rgf))}`,
      aoAbrir: corpo => ligarEscolha(corpo, true),
      aoOk: async corpo => {
        const com = escolhidos(corpo).map(x => ({ uid: x.uid, rgf: x.rgf, nome: x.nome }));
        try {
          await A().compartilharFr(f.id, com);
          Object.assign(f, { compartilhadoCom: com, compartilhadoUids: com.map(c => c.uid) });
          desenhar();
          F.avisar(com.length ? 'FR compartilhada' : 'Compartilhamento encerrado');
        } catch (err) { F.avisar('Não foi possível: ' + err.message, 'erro'); return false; }
      },
    });
  }

  // FR feita no nome errado: passa para o funcionário certo (o celular dele pega a FR ao abrir o app)
  function formTrocar(f) {
    const lista = funcionarios.filter(x => x.aprovado && x.rgf !== f.rgf).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    F.folhaForm({
      titulo: 'Trocar funcionário',
      botao: 'Passar a FR',
      html: `<p class="dica">A FR de ${escapar(F.dataCurta(f.data))} (${escapar([f.modelo, f.placa].filter(Boolean).join(' · '))}) está no nome de <b>${escapar(f.condutor)}</b>. Escolha de quem ela é:</p>
        ${escolhaFuncionarios(lista, [])}`,
      aoAbrir: corpo => ligarEscolha(corpo, false),
      aoOk: async corpo => {
        const novo = escolhidos(corpo)[0];
        if (!novo) { F.avisar('Escolha o funcionário', 'erro'); return false; }
        try {
          await A().trocarFuncionario(f.id, novo);
          const com = (f.compartilhadoCom || []).filter(c => c.rgf !== novo.rgf);
          if (com.length !== (f.compartilhadoCom || []).length) await A().compartilharFr(f.id, com);
          Object.assign(f, { rgf: novo.rgf, condutor: novo.nome, cargo: novo.cargo, compartilhadoCom: com, compartilhadoUids: com.map(c => c.uid) });
          if (document.body.dataset.tela === 'adm') desenhar();
          F.avisar(`FR passada para ${novo.nome}`);
        } catch (err) { F.avisar('Não foi possível: ' + err.message, 'erro'); return false; }
      },
    });
  }

  global.FrAdm = { abrir, fechar };
})(window);
