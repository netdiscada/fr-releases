// FR - ficha completa: mostra e deixa corrigir qualquer campo da FR atual.
// O ADM usa a mesma tela para corrigir a FR de um funcionário (F.estado.edicaoAdm): aí nada vai
// para o celular, e ao voltar a FR é salva no banco pelo ADM.

(function (global) {
  const F = global.FR;
  const { $, $$, escapar } = F;
  const form = $('#form');
  const CAMPOS_VEICULO = ['tombamento', 'marca', 'modelo', 'placa'];
  const fr = () => F.frFicha();
  const editandoAdm = () => !!F.estado.edicaoAdm;
  const cheio = c => !!String(fr()[c] || '').trim();

  function mudou() {
    if (editandoAdm()) F.estado.edicaoAdmMudou = true;
    else F.salvarLocal();
    atualizarResumo();
    previaDepois();
  }

  // Computador: o papel ao lado, acompanhando o que é digitado (com zoom)
  let papel = null, previaTimer = null;
  const previaDepois = () => { clearTimeout(previaTimer); previaTimer = setTimeout(previa, 600); };
  function previa() {
    const aside = $('#fichaPrevia');
    aside.hidden = !global.FrLista.comPainel() || document.body.dataset.tela !== 'ficha';
    if (aside.hidden || !fr()) return;
    if (!papel) papel = global.FrLista.criarPapel($('#fichaPapel'));
    papel.mostrar(JSON.parse(JSON.stringify(fr())));
  }
  // Com animação a ficha só aparece no fim da troca de tela: aí desenha o papel (antes ficava escondido até mexer)
  document.addEventListener('fr:tela', e => { if (e.detail === 'ficha') previa(); });

  // ---------- campos simples ----------
  function preencherCampos() {
    $$('input[name], textarea[name]', form).forEach(el => {
      if (el.closest('.parada')) return;
      el.value = fr()[el.name] || '';
    });
    $$('[data-grupo="combustivel"] button', form).forEach(b => b.classList.toggle('ativo', b.dataset.valor === fr().combustivel));
    // Km e horímetro: teclado de números
    $$('input[name="partida_km"], input[name="retorno_km"]', form).forEach(i => { i.inputMode = F.medidor(fr()).teclado; });
    const p = fr();
    $('#fichaCondutor').innerHTML =
      `<div><span>Nome</span><b>${escapar(p.condutor)}</b></div>` +
      `<div><span>RGF</span><b>${escapar(p.rgf)}</b></div>` +
      `<div><span>Cargo</span><b>${escapar(p.cargo)}</b></div>`;
  }

  form.addEventListener('input', e => {
    const el = e.target;
    if (el.closest('.parada') || !el.name) return;
    fr()[el.name] = el.value;
    if (el.name === 'defeitos') fr().defeitosEditado = true;
    mudou();
    if (el.tagName === 'TEXTAREA') medir(el.name);
  });

  $$('[data-agora]', form).forEach(btn => btn.addEventListener('click', () => {
    const nome = btn.dataset.agora;
    fr()[nome] = F.agora();
    $(`input[name="${nome}"]`, form).value = fr()[nome];
    mudou();
  }));

  $$('[data-grupo="combustivel"] button', form).forEach(btn => btn.addEventListener('click', () => {
    fr().combustivel = fr().combustivel === btn.dataset.valor ? '' : btn.dataset.valor;
    $$('[data-grupo="combustivel"] button', form).forEach(b => b.classList.toggle('ativo', b.dataset.valor === fr().combustivel));
    mudou();
  }));

  // Quantas linhas da FR o texto ocupa
  function medir(campo) {
    const el = $(`[data-medir="${campo}"]`, form);
    if (!el) return;
    const texto = fr()[campo] || '';
    const r = global.FrPdf.medir(campo, texto);
    if (!r || !texto.trim()) { el.textContent = ''; el.classList.remove('cheio'); return; }
    el.textContent = r.cabe ? `${r.usadas} de ${r.total} linhas da FR` : `Texto grande demais: não cabe nas ${r.total} linhas da FR`;
    el.classList.toggle('cheio', !r.cabe);
  }

  // ---------- veículos do banco ----------
  function desenharVeiculos() {
    const caixa = $('#fichaVeiculos');
    caixa.innerHTML = '';
    (F.veiculos || []).forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (v.id === fr().veiculoId ? ' ativo' : '');
      b.textContent = [v.modelo || v.marca, v.placa].filter(Boolean).join(' · ');
      b.addEventListener('click', () => {
        CAMPOS_VEICULO.forEach(c => { fr()[c] = v[c] || ''; });
        fr().veiculoId = v.id;
        fr().medidor = v.medidor === 'horimetro' ? 'horimetro' : 'km';
        preencherCampos();
        desenharVeiculos();
        mudou();
      });
      caixa.appendChild(b);
    });
  }

  // ---------- itinerário ----------
  const CAMPOS_PARADA = [
    { nome: 'saida_km', rotulo: 'Saída (km / hod.)', tipo: 'km' },
    { nome: 'saida_hora', rotulo: 'Horário', tipo: 'hora' },
    { nome: 'local', rotulo: 'Itinerário (para onde foi)', tipo: 'texto' },
    { nome: 'chegada_km', rotulo: 'Chegada (km / hod.)', tipo: 'km' },
    { nome: 'chegada_hora', rotulo: 'Horário', tipo: 'hora' },
  ];

  function desenharParadas() {
    const lista = $('#paradas');
    lista.innerHTML = '';
    fr().itinerario.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'parada';
      li.innerHTML = `<div class="parada-cab"><b>Parada ${i + 1}</b><button type="button" class="parada-remover">Remover</button></div>`;
      const grade = () => { const g = document.createElement('div'); g.className = 'grade'; return g; };
      const g1 = grade(), g2 = grade();
      CAMPOS_PARADA.forEach(c => {
        const label = document.createElement('label');
        label.className = 'campo';
        label.innerHTML = `<span>${c.rotulo}</span>`;
        const input = document.createElement('input');
        input.dataset.campo = c.nome;
        input.value = p[c.nome] || '';
        if (c.tipo === 'km' || c.tipo === 'hora') input.autocomplete = 'off'; // texto livre (local) fica com as sugestões do teclado
        if (c.tipo === 'texto') input.autocapitalize = 'words';
        if (c.tipo === 'km') input.inputMode = F.medidor(fr()).teclado;
        if (c.tipo === 'hora') {
          input.type = 'time';
          const wrap = document.createElement('span');
          wrap.className = 'hora';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'agora';
          btn.textContent = 'Agora';
          btn.addEventListener('click', () => { p[c.nome] = input.value = F.agora(); mudou(); });
          wrap.append(input, btn);
          label.appendChild(wrap);
        } else {
          label.appendChild(input);
        }
        input.addEventListener('input', () => { p[c.nome] = input.value; mudou(); });
        if (c.nome === 'local') {
          li.appendChild(label);
          F.autocompletarLocal(input);
          // Local escrito à mão na ficha também entra na lista de todos (ao sair do campo)
          input.addEventListener('change', () => F.registrarLocal(input.value));
        }
        else (c.nome.startsWith('saida') ? g1 : g2).appendChild(label);
        if (c.nome === 'saida_hora') li.appendChild(g1);
        if (c.nome === 'chegada_hora') li.appendChild(g2);
      });
      li.querySelector('.parada-remover').addEventListener('click', async () => {
        const vazia = CAMPOS_PARADA.every(c => !(p[c.nome] || '').trim());
        if (!vazia && !(await F.confirmar('Remover parada?', `A parada ${i + 1} e o que foi anotado nela serão apagados.`, 'Remover'))) return;
        fr().itinerario.splice(i, 1);
        desenharParadas();
        mudou();
      });
      lista.appendChild(li);
    });
    $('#btnParada').hidden = fr().itinerario.length >= global.FrPdf.MAX_PARADAS;
  }

  $('#btnParada').addEventListener('click', () => {
    const it = fr().itinerario;
    if (it.length >= global.FrPdf.MAX_PARADAS) return;
    const anterior = it[it.length - 1];
    it.push({ saida_km: anterior ? (anterior.chegada_km || '') : (fr().partida_km || ''), saida_hora: '', local: '', chegada_km: '', chegada_hora: '' });
    desenharParadas();
    mudou();
    const ultima = $('#paradas .parada:last-child');
    ultima.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('input[data-campo="local"]', ultima).focus({ preventScroll: true });
  });

  // ---------- resumo das seções ----------
  const SECOES = {
    veiculo: () => { const n = CAMPOS_VEICULO.filter(cheio).length; return { texto: `${n} de ${CAMPOS_VEICULO.length}`, completo: n === CAMPOS_VEICULO.length }; },
    condutor: () => ({ texto: fr().rgf ? 'RGF ' + fr().rgf : '', completo: cheio('condutor') && cheio('rgf') }),
    servico: () => ({ texto: cheio('descricao') ? F.dataCurta(fr().data) : 'falta descrição', completo: cheio('descricao') && cheio('data') }),
    saida: () => ({ texto: fr().partida_hora || '', completo: cheio('partida_km') && cheio('partida_hora') && cheio('combustivel') }),
    checklist: () => {
      // Abastecimento e limpeza (só X quando feitos) não contam como itens a conferir
      const itens = F.ITENS.filter(it => F.ehDefeito(it.id));
      const marcados = itens.filter(it => fr().checklist[it.id]).length;
      const x = itens.filter(it => fr().checklist[it.id] === 'x').length;
      return { texto: `${marcados} de ${itens.length}` + (x ? ` · ${x} X` : ''), completo: marcados === itens.length };
    },
    itinerario: () => { const n = fr().itinerario.length; return { texto: n ? `${n} ${n === 1 ? 'parada' : 'paradas'}` : '', completo: n > 0 }; },
    retorno: () => ({ texto: fr().retorno_hora || '', completo: cheio('retorno_km') && cheio('retorno_hora') }),
  };

  function atualizarResumo() {
    $$('.cartao[data-secao]', form).forEach(c => {
      if (c.hidden) return;
      const r = SECOES[c.dataset.secao]();
      c.querySelector('.cartao-status').textContent = r.texto;
      c.classList.toggle('completo', r.completo);
    });
    const m = F.medidor(fr());
    const ini = m.ler(fr().partida_km), fim = m.ler(fr().retorno_km);
    const aviso = $('#avisoKm');
    aviso.hidden = ini == null || fim == null;
    if (!aviso.hidden) {
      aviso.textContent = fim < ini
        ? `O ${m.nome} de retorno (${m.texto(fim)}) está menor que o de partida (${m.texto(ini)}). Confira.`
        : `${m.horimetro ? 'Trabalhado' : 'Rodado'} no dia: ${m.texto(fim - ini)} ${m.un}`;
    }
  }

  $$('.cartao-cab', form).forEach(cab => cab.addEventListener('click', () => cab.parentElement.classList.toggle('aberto')));

  // PDF de uma correção: grava antes, para o papel e o sistema ficarem iguais
  // FR do funcionário: retorno (ou chegada de parada) menor que a saída não passa
  async function kmConfere() {
    const x = fr(), m = F.medidor(x);
    const a = m.ler(x.partida_km), b = m.ler(x.retorno_km);
    if (a != null && b != null && b < a) { await F.kmMenor(m, a, b, 'da saída do dia'); return false; }
    const p = (x.itinerario || []).find(q => m.ler(q.chegada_km) != null && m.ler(q.saida_km) != null && m.ler(q.chegada_km) < m.ler(q.saida_km));
    if (p) { await F.kmMenor(m, m.ler(p.saida_km), m.ler(p.chegada_km), `da saída para ${p.local || 'a parada'}`); return false; }
    return true;
  }

  $('#btnFichaPdf').addEventListener('click', async () => {
    if (!editandoAdm() && !(await kmConfere())) return;
    if (!editandoAdm()) F.sincronizar();
    else if (!(await F.estado.salvarEdicao())) return;
    try { await F.gerarEMostrarPdf(fr()); }
    catch (e) { F.avisar('Não foi possível gerar o PDF: ' + e.message, 'erro'); }
  });
  // Salvar: a correção (ADM, chefe, FR antiga) grava no banco; a FR do dia grava e volta para o início
  $('#btnFichaSalvar').addEventListener('click', async () => {
    if (editandoAdm()) { F.estado.aoFimEdicao(); return; }
    if (!(await kmConfere())) return;
    F.sincronizar();
    global.FrDia.inicio();
    F.avisar('FR salva');
  });
  // Voltar sem salvar (a seta do topo salva; este pergunta se houve mudança)
  $('#btnFichaVoltar').addEventListener('click', async () => {
    if (F.estado.edicaoAdmMudou && !(await F.confirmar('Sair sem salvar?', 'As mudanças feitas nesta FR serão descartadas.', 'Sair sem salvar'))) return;
    F.estado.sairEdicao();
  });

  // Corrigir uma FR do banco (ADM, chefe ou o próprio funcionário, numa FR já encerrada).
  // salvar(fr) grava; voltar() volta para a tela de onde veio. Grava no botão Salvar, ao voltar e antes do PDF.
  // veiculo: true deixa trocar os dados do veículo (só o ADM)
  function editarFr(f, { salvar, voltar, aviso, veiculo }) {
    const copia = JSON.parse(JSON.stringify(f));
    copia.itinerario = copia.itinerario || [];
    copia.checklist = copia.checklist || {};
    copia.defeitosItens = copia.defeitosItens || {};
    F.estado.edicaoAdm = copia;
    F.estado.edicaoAdmMudou = false;
    F.estado.edicaoVeiculo = !!veiculo;
    F.estado.avisoEdicao = aviso || `Corrigindo a FR de ${copia.condutor} (${F.dataCurta(copia.data)}).`;
    let antes = JSON.parse(JSON.stringify(f)); // como estava no banco (o km de retorno corrigido segue em cadeia)
    F.estado.salvarEdicao = async () => {
      const x = F.estado.edicaoAdm;
      if (!x || !F.estado.edicaoAdmMudou) return true;
      const btn = $('#btnFichaSalvar');
      btn.disabled = true;
      try {
        // Sem internet a gravação fica na fila do celular: não espera o servidor para sempre
        const r = await Promise.race([salvar(x, antes), new Promise(res => setTimeout(res, 5000))]);
        F.estado.edicaoAdmMudou = false;
        Object.assign(f, x);
        antes = JSON.parse(JSON.stringify(x));
        F.avisar(typeof r === 'string' ? r : 'Correção salva');
        return true;
      } catch (e) {
        F.avisar('Não foi possível salvar: ' + (e.code === 'permission-denied' ? 'sem permissão' : e.message || e), 'erro');
        return false;
      } finally { btn.disabled = false; }
    };
    F.estado.aoFimEdicao = async () => {
      if (!(await F.estado.salvarEdicao())) return;
      F.estado.edicaoAdm = null;
      voltar();
    };
    F.estado.sairEdicao = () => { F.estado.edicaoAdm = null; F.estado.edicaoAdmMudou = false; voltar(); };
    abrir();
  }

  function abrir() {
    const adm = F.estado.edicaoAdm;
    $('#fichaAdm').hidden = !adm;
    $('#btnFichaSalvar').hidden = false;
    $('#btnFichaVoltar').hidden = !adm;
    $('.barra-ficha').classList.toggle('tres', !!adm);
    // Dados do veículo vêm do cadastro: o funcionário (e o chefe) não mudam; só o ADM corrige
    $('[data-secao="veiculo"]', form).hidden = !(adm && F.estado.edicaoVeiculo);
    $$('.cartao[data-secao]', form).filter(c => !c.hidden).forEach((c, i) => { c.querySelector('.cartao-num').textContent = i + 1; });
    if (adm) $('#fichaAdm').textContent = `${F.estado.avisoEdicao} Toque em Salvar para gravar a correção.`;
    preencherCampos();
    desenharVeiculos();
    global.FrChecklist.render($('#fichaChecklist'), {
      aoMudar: () => {
        if (!fr().defeitosEditado) { fr().defeitos = F.textoDefeitos(fr()); const el = $('textarea[name="defeitos"]', form); if (el) el.value = fr().defeitos; }
        mudou();
      },
    });
    desenharParadas();
    atualizarResumo();
    ['descricao', 'defeitos', 'ocorrencias'].forEach(medir);
    $$('.cartao[data-secao]', form).forEach(c => c.classList.remove('aberto'));
    const alvo = $$('.cartao[data-secao]', form).find(c => !c.hidden && !SECOES[c.dataset.secao]().completo);
    if (alvo) alvo.classList.add('aberto');
    F.mostrarTela('ficha');
    previa();
  }

  global.FrFicha = { abrir, desenharVeiculos, editarFr };
})(window);
