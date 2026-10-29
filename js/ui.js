// FR - utilitários de tela compartilhados (seletores, avisos, diálogos, armazenamento local e a FR atual).

(function (global) {
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  function ler(chave, padrao) {
    try { const v = JSON.parse(localStorage.getItem(chave)); return v == null ? padrao : v; }
    catch (e) { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem espaço: segue sem salvar */ }
  }

  const dois = n => String(n).padStart(2, '0');
  function hoje() { const d = new Date(); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; }
  function agora() { const d = new Date(); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; }
  function dataCurta(iso) { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
  function numero(v) { const n = parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10); return isNaN(n) ? null : n; }
  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- avisos e diálogos ----------
  let toastTimer = null;
  function avisar(msg, tipo) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'aviso-flutuante visivel' + (tipo === 'erro' ? ' erro' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'aviso-flutuante'; }, 3500);
  }

  // Abrir uma janela tira o aviso flutuante da frente
  function abrirFolha(id) { $('#toast').className = 'aviso-flutuante'; $('#' + id).hidden = false; }
  function fecharFolha(id) { $('#' + id).hidden = true; }
  function fecharFolhas() { $$('.folha').forEach(f => { f.hidden = true; }); }
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-fechar]');
    if (f) f.closest('.folha').hidden = true;
  });

  // Aviso que não deixa seguir (só um botão): o funcionário volta e corrige
  function alertar(titulo, texto, botao = 'Vou conferir') {
    return new Promise(resolve => {
      const folha = $('#folhaConfirma');
      const sim = $('#confirmaSim'), nao = $('#folhaConfirma .btn-texto[data-fechar]');
      $('#confirmaTitulo').textContent = titulo;
      $('#confirmaTexto').textContent = texto;
      sim.textContent = botao;
      sim.className = 'btn btn-principal';
      nao.hidden = true;
      folha.classList.add('folha-alerta');
      const fim = () => { folha.removeEventListener('click', aoClicar); folha.hidden = true; nao.hidden = false; folha.classList.remove('folha-alerta'); resolve(); };
      const aoClicar = e => { if (e.target.closest('#confirmaSim') || e.target.closest('[data-fechar]')) fim(); };
      folha.addEventListener('click', aoClicar);
      abrirFolha('folhaConfirma');
    });
  }
  // Km (ou horímetro) de chegada/retorno menor que o de saída: bloqueia, explicando o porquê
  function kmMenor(m, ini, fim, onde) {
    return alertar(m.horimetro ? 'Verifique o horímetro' : 'Verifique a quilometragem',
      `O ${m.nome} que você digitou (${m.texto(fim)} ${m.un}) é menor que o ${onde} (${m.texto(ini)} ${m.un}). ` +
      `O ${m.nome} do veículo só aumenta, então um dos dois números está errado.\n\n` +
      `Confira no painel do veículo e digite de novo. Se foi a saída que veio errada (o funcionário anterior anotou errado), ` +
      `corrija em Ficha completa › Saída ou avise o chefe.`);
  }

  function confirmar(titulo, texto, botao, perigo = true) {
    return new Promise(resolve => {
      $('#confirmaTitulo').textContent = titulo;
      $('#confirmaTexto').textContent = texto;
      const sim = $('#confirmaSim');
      sim.textContent = botao;
      sim.className = 'btn ' + (perigo ? 'btn-perigo' : 'btn-principal');
      const folha = $('#folhaConfirma');
      const fim = ok => { folha.removeEventListener('click', aoClicar); folha.hidden = true; resolve(ok); };
      const aoClicar = e => {
        if (e.target.closest('#confirmaSim')) fim(true);
        else if (e.target.closest('[data-fechar]')) fim(false);
      };
      folha.addEventListener('click', aoClicar);
      abrirFolha('folhaConfirma');
    });
  }

  // ---------- campo de horário ----------
  // O relógio do Android (input type="time") corta o botão "Definir" em alguns celulares.
  // Todo campo de horário vira texto com teclado numérico: digita 1053 e aparece 10:53.
  // type="tel": o teclado de números do telefone, que o Android sempre respeita (o inputmode
  // "numeric" alguns teclados ignoram e mostram o teclado de letras)
  function campoHora(input) {
    if (input.dataset.hora) return;
    input.dataset.hora = '1';
    input.type = 'tel';
    input.inputMode = 'numeric';
    input.maxLength = 5;
    input.autocomplete = 'off';
    if (!input.placeholder) input.placeholder = '00:00';
  }
  function formatarHora(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
  }
  // "7" → 07:00, "730" → 07:30, "1053" → 10:53; horário impossível fica vazio
  function completarHora(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    const [h, m] = d.length <= 2 ? [+d, 0] : d.length === 3 ? [+d[0], +d.slice(1)] : [+d.slice(0, 2), +d.slice(2, 4)];
    return h > 23 || m > 59 ? null : `${dois(h)}:${dois(m)}`;
  }
  // Na fase de captura: formata antes dos outros ouvintes lerem o valor
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.hora) return;
    const v = formatarHora(el.value);
    if (v !== el.value) el.value = v;
  }, true);
  document.addEventListener('focusout', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.hora || !el.value) return;
    const v = completarHora(el.value);
    if (v === null) { avisar('Horário inválido. Ex.: 07:30', 'erro'); el.value = ''; }
    else if (v === el.value) return;
    else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
  // Km, horímetro, RGF e outros campos só de números: também teclado de telefone
  function campoNumero(input) {
    if (input.type !== 'text' && input.type !== '') return;
    input.type = 'tel';
    input.autocomplete = 'off';
  }
  const trocarCampos = raiz => {
    if (!raiz.querySelectorAll) return;
    raiz.querySelectorAll('input[type="time"]').forEach(campoHora);
    raiz.querySelectorAll('input[inputmode="numeric"]').forEach(campoNumero);
  };
  const conferirCampo = n => {
    if (n.matches('input[type="time"]')) campoHora(n);
    else if (n.matches('input[inputmode="numeric"]')) campoNumero(n);
    else trocarCampos(n);
  };
  new MutationObserver(lista => lista.forEach(m => {
    m.addedNodes.forEach(n => { if (n.nodeType === 1) conferirCampo(n); });
    // inputmode trocado depois (km ↔ horímetro no cadastro do veículo)
    if (m.type === 'attributes' && m.target.matches('input[inputmode="numeric"]')) campoNumero(m.target);
  })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['inputmode'] });
  trocarCampos(document);

  // ---------- telas ----------
  function mostrarTela(nome) {
    $$('.tela').forEach(t => { t.hidden = t.id !== 'tela-' + nome; });
    document.body.dataset.tela = nome;
    window.scrollTo(0, 0);
  }

  // ---------- perfil do funcionário e FR atual ----------
  const CHAVE_PERFIL = 'fr.perfil.v2';
  const CHAVE_FR = 'fr.atual.v2';

  const perfil = () => ler(CHAVE_PERFIL, null);
  const salvarPerfil = p => gravar(CHAVE_PERFIL, p);

  const ITENS = global.FR_LAYOUT.pagina1.checklist.flatMap(g => g.itens);
  const GRUPO_ITEM = {};
  global.FR_LAYOUT.pagina1.checklist.forEach((g, i) => g.itens.forEach(it => { GRUPO_ITEM[it.id] = i; }));
  // X neste item é defeito do veículo? (abastecimento e limpeza não são)
  const SEM_DEFEITO = {};
  global.FR_LAYOUT.pagina1.checklist.forEach(g => { if (g.semDefeito) g.itens.forEach(it => { SEM_DEFEITO[it.id] = true; }); });
  const ehDefeito = id => !SEM_DEFEITO[id];
  // Itens com X (defeito) que o funcionário deixou sem descrição: o chefe ou o ADM confere
  const defeitosSemDescricao = fr => ITENS.filter(it => fr.checklist && fr.checklist[it.id] === 'x' && ehDefeito(it.id)
    && !((fr.defeitosItens || {})[it.id] || '').trim()).map(it => it.nome);

  function frNova() {
    const p = perfil() || {};
    return {
      id: global.FrDb.novoId(), status: 'aberta', data: hoje(),
      rgf: p.rgf || '', condutor: p.nome || '', cargo: p.cargo || '',
      combustivel: '', checklist: checklistTudoOk(), defeitosItens: {}, itinerario: [],
    };
  }

  // fr: a FR deste funcionário. convidadoId: FR de um colega que ele está usando (compartilhada).
  const estado = { fr: ler(CHAVE_FR, null), convidadoId: ler('fr.convidado.v1', null) };
  // FRs que colegas compartilharam com este celular (vem do banco, ao vivo)
  const compartilhadas = () => global.FR.listaCompartilhadas || [];
  const convidada = () => (estado.convidadoId && compartilhadas().find(f => f.id === estado.convidadoId)) || null;
  function usarConvidada(id) { estado.convidadoId = id; gravar('fr.convidado.v1', id); }
  // FR que a tela do dia mostra e onde as paradas são registradas
  const frAtual = () => convidada() || estado.fr;
  // FR da ficha completa e da inspeção: a do funcionário, ou a que o ADM (ou o chefe) está corrigindo
  const frFicha = () => estado.edicaoAdm || estado.fr;
  // FRs que o chefe preparou para este funcionário (vem do banco, ao vivo)
  const preparadas = () => global.FR.listaPreparadas || [];
  const ehChefe = () => { const p = perfil(); return !!p && p.papel === 'chefe'; };

  // FR do banco → FR do celular (sem os campos que só o banco controla)
  const millis = ts => (ts && ts.toMillis ? ts.toMillis() : 0);
  function paraLocal(r) {
    const x = Object.assign({}, r, {
      _enviada: true, _itinerarioEnviado: JSON.stringify(r.itinerario || []), _editadoAdmEm: millis(r.editadoAdmEm),
      _correcaoKmEm: (r.correcaoKm && r.correcaoKm.em) || 0,
    });
    global.FrDb.SO_BANCO.forEach(k => delete x[k]);
    x.itinerario = x.itinerario || [];
    x.checklist = x.checklist || {};
    return x;
  }
  let salvarTimer = null;
  function salvarLocal() {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(() => gravar(CHAVE_FR, estado.fr), 200);
  }
  function salvarAgora() { clearTimeout(salvarTimer); gravar(CHAVE_FR, estado.fr); }

  // Grava no celular e manda para o banco (fica na fila se estiver sem internet).
  // Na FR de um colega só vão as paradas.
  function sincronizar() {
    const c = convidada();
    if (c) { global.FrDb.salvarItinerario(c).catch(() => {}); return; }
    if (estado.fr) estado.fr._itinerarioEnviado = JSON.stringify(estado.fr.itinerario || []);
    salvarAgora();
    if (!estado.fr || !estado.fr.rgf) return;
    global.FrDb.salvarFr(estado.fr).catch(e => console.warn('[FR] sincronizar', e));
  }

  // ---------- histórico local (sugestões) ----------
  function lembrarLocal(local) {
    local = (local || '').trim();
    if (!local) return;
    const mapa = ler('fr.locais.v1', {});
    const chave = local.toLocaleUpperCase('pt-BR');
    mapa[chave] = { texto: local, n: ((mapa[chave] && mapa[chave].n) || 0) + 1, em: Date.now() };
    gravar('fr.locais.v1', mapa);
  }
  // Locais que este funcionário já usou, com quantas vezes (mais usados primeiro)
  function historicoLocais(max = 8) {
    return Object.values(ler('fr.locais.v1', {})).sort((a, b) => b.n - a.n || b.em - a.em).slice(0, max);
  }
  function locaisFrequentes(max = 8) {
    return Object.values(ler('fr.locais.v1', {}))
      .sort((a, b) => b.n - a.n || b.em - a.em).slice(0, max).map(l => l.texto);
  }
  // ---------- locais compartilhados (todos os funcionários) ----------
  // "Quatinga", "quatinga" e "QUATINGA " são o mesmo local
  const chaveLocal = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
  const locais = () => global.FR.locais || [];

  // Sugestões para o que está sendo digitado: começa com o texto, depois alguma palavra que começa
  // com ele, depois contém; dentro de cada grupo, os mais usados primeiro
  function sugerirLocais(digitado, max = 8) {
    const q = chaveLocal(digitado);
    if (!q) return [];
    const nivel = c => (c.startsWith(q) ? 0 : (' ' + c).includes(' ' + q) ? 1 : c.includes(q) ? 2 : 9);
    return locais().map(l => { const c = chaveLocal(l.texto); return { texto: l.texto, n: l.n, chave: c, nivel: nivel(c) }; })
      .filter(l => l.nivel < 9 && l.chave !== q)
      .sort((a, b) => a.nivel - b.nivel || (b.n || 0) - (a.n || 0) || a.texto.localeCompare(b.texto))
      .slice(0, max).map(l => l.texto);
  }

  // Grava o local na lista de todos (novo) ou soma 1 no uso (já existe)
  function registrarLocal(texto) {
    texto = String(texto || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const p = perfil();
    if (!texto || !p) return;
    const chave = chaveLocal(texto);
    const existente = locais().find(l => l.chave === chave) || locais().find(l => chaveLocal(l.texto) === chave);
    if (existente) { global.FrDb.registrarLocal(texto, existente.chave, p.rgf, existente).catch(() => {}); return; }
    // Local novo fica guardado no celular até o servidor confirmar: se o app for fechado sem internet
    // logo depois, a fila do Firebase pode não ter sido salva, e ele é enviado de novo ao abrir
    const pend = ler(CHAVE_LOCAIS_PEND, {});
    pend[chave] = texto;
    gravar(CHAVE_LOCAIS_PEND, pend);
    global.FrDb.registrarLocal(texto, chave, p.rgf, null).then(() => tirarPendente(chave)).catch(() => {});
  }
  const CHAVE_LOCAIS_PEND = 'fr.locaisPendentes.v1';
  function tirarPendente(chave) {
    const pend = ler(CHAVE_LOCAIS_PEND, {});
    delete pend[chave];
    gravar(CHAVE_LOCAIS_PEND, pend);
  }
  // Ao abrir: espera a fila subir e reenvia os locais novos que não chegaram ao servidor
  async function reenviarLocais() {
    const pend = ler(CHAVE_LOCAIS_PEND, {});
    if (!Object.keys(pend).length) return;
    const noServidor = await global.FrDb.chavesLocaisNoServidor();
    const p = perfil();
    Object.entries(pend).forEach(([chave, texto]) => {
      if (noServidor.includes(chave) || !p) { tirarPendente(chave); return; }
      global.FrDb.registrarLocal(texto, chave, p.rgf, null).then(() => tirarPendente(chave)).catch(() => {});
    });
  }

  // Lista de sugestões embaixo de um campo de local; tocar numa sugestão preenche o campo
  function autocompletarLocal(input) {
    const lista = document.createElement('div');
    lista.className = 'sugestoes';
    lista.hidden = true;
    (input.closest('label') || input).after(lista);
    const desenhar = () => {
      const s = sugerirLocais(input.value);
      lista.innerHTML = s.map(t => `<button type="button" data-sugestao="${escapar(t)}">${escapar(t)}</button>`).join('');
      lista.hidden = !s.length || document.activeElement !== input;
    };
    input.addEventListener('input', desenhar);
    input.addEventListener('focus', desenhar);
    // Espera o toque na sugestão antes de esconder
    input.addEventListener('blur', () => setTimeout(() => { lista.hidden = true; }, 200));
    lista.addEventListener('pointerdown', e => e.preventDefault()); // não tira o foco do campo
    lista.addEventListener('click', e => {
      const b = e.target.closest('[data-sugestao]');
      if (!b) return;
      input.value = b.dataset.sugestao;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      lista.hidden = true;
    });
    return lista;
  }

  function lembrarDescricao(texto) {
    texto = (texto || '').trim();
    if (!texto) return;
    const lista = ler('fr.descricoes.v1', []).filter(t => t.toLowerCase() !== texto.toLowerCase());
    lista.unshift(texto);
    gravar('fr.descricoes.v1', lista.slice(0, 6));
  }
  const descricoesRecentes = () => ler('fr.descricoes.v1', []);

  // Inspeção começa toda em OK: o funcionário só troca para X o que tiver problema
  function checklistTudoOk() {
    const c = {};
    ITENS.forEach(it => { c[it.id] = 'ok'; });
    return c;
  }

  // "Defeitos / Avarias" = o que o funcionário escreveu em cada item marcado com X (nada automático)
  function textoDefeitos(fr) {
    const d = fr.defeitosItens || {};
    return ITENS.filter(it => fr.checklist[it.id] === 'x' && ehDefeito(it.id)).map(it => (d[it.id] || '').trim()).filter(Boolean).join('; ');
  }

  // ---------- km ou horímetro ----------
  // Cada veículo diz como mede: medidor 'km' (padrão) ou 'horimetro' (máquinas). A FR copia do veículo.
  // A FR anterior do veículo tinha o km de retorno errado e foi corrigida: a FR que saiu com esse km
  // (km de saída e a saída da 1ª parada) passa a ter o certo. Devolve true se mudou algo.
  function aplicarCorrecaoKm(x, de, para) {
    if (!x) return false;
    const m = medidor(x);
    const errado = m.ler(de);
    if (errado == null || m.ler(x.partida_km) !== errado) return false;
    x.partida_km = para;
    x.kmEsperado = para;
    x.kmDivergente = false;
    const p = (x.itinerario || [])[0];
    if (p && m.ler(p.saida_km) === errado) p.saida_km = para;
    return true;
  }

  function medidor(x) {
    const h = !!x && x.medidor === 'horimetro';
    return {
      horimetro: h,
      un: h ? 'h' : 'km',
      nome: h ? 'horímetro' : 'km', // "Digite o km" / "Digite o horímetro"
      Nome: h ? 'Horímetro' : 'Km',
      // km só com dígitos; horímetro lê também decimal antigo (1234,5)
      ler: v => {
        if (!h) return numero(v);
        const n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.]/g, ''));
        return isNaN(n) ? null : n;
      },
      texto: n => (h ? String(Math.round(n * 10) / 10).replace('.', ',') : String(n)),
      // Para mostrar grande: km com espaço de milhar (217 690); horímetro igual ao texto
      grande: n => (h ? String(Math.round(n * 10) / 10).replace('.', ',') : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')),
      teclado: 'numeric', // horímetro também é só número inteiro: teclado de números
      limiteParada: h ? 12 : 300, // acima disso por parada, o app pede para conferir
    };
  }

  // Placa no padrão Mercosul; máquina sem placa ganha a etiqueta MÁQUINA; sem placa, o tombamento
  function placaHtml(v) {
    if (v && v.placa) return `<span class="veiculo-placa">${escapar(v.placa)}</span>`;
    if (medidor(v).horimetro) return '<span class="veiculo-placa placa-maquina">MÁQUINA</span>';
    return `<span class="veiculo-placa">${escapar((v && v.tombamento) || 'SEM PLACA')}</span>`;
  }

  // ---------- licenciamento ----------
  // Aviso a partir de 30 dias antes do vencimento; sem data cadastrada, nada aparece
  function alertaLicenciamento(v) {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.licenciamentoVence || '')) return null;
    const [a, m, d] = v.licenciamentoVence.split('-').map(Number);
    const h = new Date();
    const dias = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
    if (dias > 30) return null;
    const nome = 'do veículo ' + ([v.modelo || v.marca, v.placa].filter(Boolean).join(' ') || '');
    const data = dataCurta(v.licenciamentoVence);
    if (dias < 0) return { vencido: true, texto: `Licenciamento ${nome.trim()} vencido desde ${data}` };
    if (dias === 0) return { vencido: true, texto: `Licenciamento ${nome.trim()} vence hoje` };
    return { vencido: false, texto: `${dias} ${dias === 1 ? 'dia' : 'dias'} para expirar o licenciamento ${nome.trim()} (${data})` };
  }

  // ---------- "⋯ Mais": as opções que não couberam nos botões ----------
  // itens: [{ rotulo, fn, perigo }] (falsos são ignorados). Cada opção fecha a janela e chama fn.
  function menuAcoes(titulo, texto, itens) {
    const lista = itens.filter(Boolean);
    $('#acoesTitulo').textContent = titulo;
    $('#acoesTexto').textContent = texto || '';
    $('#acoesTexto').hidden = !texto;
    const caixa = $('#acoesLista');
    caixa.innerHTML = lista.map((a, i) => `<button type="button" class="btn ${a.perigo ? 'btn-perigo-suave' : 'btn-claro'}" data-op="${i}">${global.FR.ic(a.icone)}${escapar(a.rotulo)}</button>`).join('');
    $$('[data-op]', caixa).forEach(b => b.addEventListener('click', () => { fecharFolha('folhaAcoes'); lista[+b.dataset.op].fn(); }));
    abrirFolha('folhaAcoes');
  }

  // dpi para mostrar uma folha A4 (21 cm) com a largura em px de tela: nítido sem gastar à toa (celular é lento)
  const dpiTela = largura => Math.round(Math.min(200, Math.max(96, largura * (global.devicePixelRatio || 1) * 1.15 / 8.27)));

  // ---------- visor da FR (popup só de leitura, com zoom) ----------
  // acoes: [{ rotulo, fn, principal }] (itens falsos são ignorados). Cada botão fecha o visor e chama fn.
  // titulo e texto são opcionais. Usado pelo chefe, pelo funcionário (ao encerrar e no histórico) e pelo "Abrir".
  let visorFr = null;
  async function verFr(f, { acoes = [], titulo, texto } = {}) {
    const visor = $('#visorPdf');
    $('#visorTitulo').textContent = titulo || `FR de ${f.condutor || ''} · ${dataCurta(f.data)}`;
    $('#visorTexto').textContent = texto || '';
    $('#visorTexto').hidden = !texto;
    const folhas = $('#visorFolhas');
    $$('img', folhas).forEach(i => URL.revokeObjectURL(i.src));
    folhas.innerHTML = '<div class="vazio"><div class="girando"></div><p>Abrindo a FR…</p></div>';
    const lista = acoes.filter(Boolean);
    const caixa = $('#visorAcoes');
    caixa.innerHTML = lista.map((a, i) => `<button type="button" class="btn ${a.principal ? 'btn-principal' : 'btn-claro'}" data-visor="${i}">${global.FR.ic(a.icone)}${escapar(a.rotulo)}</button>`).join('');
    // Até 3 botões numa linha; com 4 (Editar, Abrir/Baixar, Compartilhar, Imprimir) o Imprimir desce no celular
    caixa.classList.toggle('muitas', lista.length > 3);
    caixa.style.gridTemplateColumns = lista.length > 3 ? `repeat(${lista.length - 1}, 1fr)` : lista.length > 1 ? `repeat(${lista.length - 1}, 1fr) 1.4fr` : '1fr';
    caixa.hidden = !lista.length;
    $$('[data-visor]', caixa).forEach(b => b.addEventListener('click', () => { fecharVisor(); lista[+b.dataset.visor].fn(f); }));
    visor.hidden = false;
    document.body.classList.add('travado'); // a página de trás não rola
    visorFr = f;
    zoom(1);
    try {
      const bytes = await global.FrPdf.gerar(f);
      // Nitidez pela tela (celular precisa de bem menos que o computador): a frente aparece assim que fica pronta
      const dpi = dpiTela(Math.min(innerWidth, 1000));
      const folha = (u, i) => `<figure class="visor-folha"><img src="${u}" alt="Folha ${i + 1} da FR"><figcaption>${i === 0 ? 'Frente' : 'Verso'}</figcaption></figure>`;
      const frente = await global.FrImprimir.imagem(bytes, 1, dpi);
      if (visorFr !== f) { URL.revokeObjectURL(frente); return; }
      folhas.innerHTML = folha(frente, 0);
      const verso = await global.FrImprimir.imagem(bytes, 2, dpi);
      if (visorFr !== f) { URL.revokeObjectURL(verso); return; }
      folhas.insertAdjacentHTML('beforeend', folha(verso, 1));
    } catch (e) { folhas.innerHTML = `<p class="aviso">Não foi possível abrir a FR: ${escapar(e.message)}</p>`; }
  }
  function fecharVisor() {
    $('#visorPdf').hidden = true;
    document.body.classList.remove('travado');
    $$('#visorFolhas img').forEach(i => URL.revokeObjectURL(i.src));
    $('#visorFolhas').innerHTML = '';
    visorFr = null;
  }
  // (o ui.js carrega no fim do <body>: o visor já existe)
  $('#visorFechar').addEventListener('click', fecharVisor);

  // Zoom do visor: só a pinça com dois dedos e o toque duplo (as folhas já vêm grandes, uma embaixo da outra)
  let nivel = 1;
  function zoom(n, cx, cy) {
    const caixa = $('#visorFolhas');
    const antes = nivel;
    nivel = Math.min(4, Math.max(1, n));
    caixa.style.setProperty('--zoom', nivel);
    caixa.classList.toggle('ampliado', nivel > 1.01);
    // Mantém o ponto do toque no mesmo lugar da tela
    if (cx != null && antes !== nivel) {
      const r = caixa.getBoundingClientRect();
      const k = nivel / antes;
      caixa.scrollLeft = (caixa.scrollLeft + cx - r.left) * k - (cx - r.left);
      caixa.scrollTop = (caixa.scrollTop + cy - r.top) * k - (cy - r.top);
    }
  }
  (() => {
    const caixa = $('#visorFolhas');
    let pinca = null, ultimoToque = 0;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    caixa.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { pinca = { d: dist(e.touches), z: nivel }; e.preventDefault(); return; }
      const agora = Date.now();
      if (e.touches.length === 1 && agora - ultimoToque < 300 && e.target.closest('.visor-folha')) {
        e.preventDefault();
        zoom(nivel > 1.01 ? 1 : 2.5, e.touches[0].clientX, e.touches[0].clientY);
      }
      ultimoToque = agora;
    }, { passive: false });
    caixa.addEventListener('touchmove', e => {
      if (!pinca || e.touches.length !== 2) return;
      e.preventDefault();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoom(pinca.z * dist(e.touches) / pinca.d, cx, cy);
    }, { passive: false });
    caixa.addEventListener('touchend', e => { if (e.touches.length < 2) pinca = null; });
    caixa.addEventListener('dblclick', e => { if (e.target.closest('.visor-folha')) zoom(nivel > 1.01 ? 1 : 2.5, e.clientX, e.clientY); });
  })();

  // ---------- PDF ----------
  const nativo = !!(global.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  const plugin = nome => (nativo && Capacitor.Plugins && Capacitor.Plugins[nome]) || null;
  let ultimoPdf = null;
  let podeCompartilhar = false;

  // FR_ANTONIO_DE_SOUZA_VIEIRA_26-10-2026.pdf (sem acento: alguns celulares e impressoras estranham)
  function nomeArquivo(fr) {
    const nome = String(fr.condutor || 'FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const [a, m, d] = (fr.data || hoje()).split('-');
    return `FR_${nome}_${d}-${m}-${a}.pdf`;
  }
  function emBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const arquivoPdf = () => new File([ultimoPdf.bytes], ultimoPdf.nome, { type: 'application/pdf' });

  // opcoes.aoImprimir: chamado quando a FR vai para a impressora (o chefe marca como impressa)
  // Ver o PDF de uma FR: o papel montado no visor e, embaixo, sempre os mesmos botões
  // (Editar quando der, Abrir no APK, Compartilhar no celular, Baixar PDF no site, Imprimir).
  function acoesPdf(fr, aoImprimir) {
    const usar = acao => async () => {
      const bytes = await global.FrPdf.gerar(fr);
      ultimoPdf = { bytes, nome: nomeArquivo(fr), frs: [{ fr, bytes }], aoImprimir };
      await usarPdf(acao);
    };
    return [
      nativo && { rotulo: 'Abrir', icone: 'abrir', fn: usar('abrir') },
      podeCompartilharPdf() && { rotulo: 'Compartilhar', icone: 'compartilhar', fn: usar('compartilhar') },
      !nativo && { rotulo: 'Baixar PDF', icone: 'baixar', fn: usar('abrir') },
      { rotulo: 'Imprimir', icone: 'imprimir', principal: true, fn: usar('imprimir') },
    ].filter(Boolean);
  }
  function verPdf(fr, { aoImprimir, editar, texto, titulo } = {}) {
    return verFr(fr, { texto, titulo, acoes: [editar && { rotulo: 'Editar', icone: 'editar', fn: editar }, ...acoesPdf(fr, aoImprimir)] });
  }
  // Antigo "FR pronta" (Imprimir / Abrir / Compartilhar): agora abre o visor com o papel
  async function gerarEMostrarPdf(fr, texto, opcoes = {}) {
    verPdf(fr, { aoImprimir: opcoes.aoImprimir, texto });
  }
  async function usarPdf(acao) {
    if (!ultimoPdf) return;
    const nativoPdf = plugin('FrPdf');
    if (acao === 'imprimir' && !nativoPdf && !ler(CHAVE_GUIA, false)) {
      guiaImpressao();
      return;
    }
    if (acao === 'imprimir' && !nativoPdf) { await imprimirWeb(); return; }
    if (nativoPdf) {
      try {
        await nativoPdf[acao]({ base64: emBase64(ultimoPdf.bytes), nome: ultimoPdf.nome });
        if (acao === 'imprimir') impressa();
      } catch (e) { avisar(e.message || 'Não foi possível abrir o PDF', 'erro'); }
      return;
    }
    if (acao === 'compartilhar') {
      try { await navigator.share({ files: [arquivoPdf()], title: ultimoPdf.nome }); }
      catch (e) { if (e.name !== 'AbortError') avisar('Não foi possível compartilhar', 'erro'); }
      return;
    }
    const url = URL.createObjectURL(new Blob([ultimoPdf.bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimoPdf.nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // No navegador não dá para deixar "frente e verso" marcado: antes de imprimir, o passo a passo
  // da tela de impressão do Android (até o funcionário pedir para não mostrar mais)
  const CHAVE_GUIA = 'fr.guiaImpressao.v1';
  function guiaImpressao() {
    // Computador (mouse): tela de impressão do Chrome/Edge
    const pc = global.matchMedia && matchMedia('(pointer: fine)').matches;
    global.FR.folhaForm({
      titulo: 'Antes de imprimir',
      botao: 'Entendi, imprimir',
      html: pc ? `<ol class="guia">
          <li>Escolha a <b>impressora</b> em "Destino".</li>
          <li>Abra <b>Mais definições</b>.</li>
          <li>Marque <b>Imprimir dos dois lados</b> (borda longa).<small>Borda curta deixa o verso de ponta-cabeça.</small></li>
          <li>Papel <b>A4</b>, <b>Retrato</b>, margens <b>Nenhuma</b>, e clique em Imprimir.</li>
        </ol>
        <p class="dica">Para não ver essa tela toda vez, veja "Impressão e backup" no painel do chefe.</p>
        <label class="marcar"><input type="checkbox" id="guiaNaoMostrar"> Já sei, não mostrar de novo neste computador</label>` : `<ol class="guia">
          <li>Escolha a <b>impressora</b> no alto da tela.</li>
          <li>Toque na <b>setinha</b> (⌄) para ver mais opções.</li>
          <li>Em <b>Frente e verso</b>, escolha <b>Borda longa</b>.<small>Borda curta deixa o verso de ponta-cabeça.</small></li>
          <li>Papel <b>A4</b>, orientação <b>Retrato</b>, e toque no botão de imprimir.</li>
        </ol>
        <label class="marcar"><input type="checkbox" id="guiaNaoMostrar"> Já sei, não mostrar de novo neste celular</label>`,
      aoOk: () => {
        if ($('#guiaNaoMostrar').checked) gravar(CHAVE_GUIA, true);
        global.FR.fecharFolha('folhaForm');
        imprimirWeb();
      },
    });
  }

  async function imprimirWeb() {
    const btn = $('#btnImprimirPdf');
    btn.disabled = true;
    btn.textContent = 'Preparando…';
    try { await global.FrImprimir.imprimir(ultimoPdf.bytes, ultimoPdf.nome); impressa(); }
    catch (e) { console.error('[FR] imprimir', e); avisar('Não foi possível imprimir. Use "Baixar o PDF".', 'erro'); }
    finally { btn.disabled = false; btn.textContent = 'Imprimir'; }
  }
  // A FR foi para a impressora: cópia na pasta de backup (computador) e marca como impressa
  function impressa() {
    const u = ultimoPdf;
    if (!u || !u.frs) return;
    if (global.FrBackup) u.frs.forEach(p => global.FrBackup.guardar(p.fr, p.bytes));
    const frs = u.frs.map(p => p.fr);
    if (u.aoImprimir) u.aoImprimir(frs);
    else if (frs[0] === estado.fr && estado.fr.rgf) global.FrDb.marcarImpressas([estado.fr.id], estado.fr.condutor).catch(() => {});
  }

  // Compartilhar o PDF de uma FR (APK e celular); no computador, que não compartilha arquivo, salva o PDF
  const podeCompartilharPdf = () => nativo
    || !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.pdf', { type: 'application/pdf' })] }));
  async function compartilharFr(fr, aoImprimir) {
    const bytes = await global.FrPdf.gerar(fr);
    ultimoPdf = { bytes, nome: nomeArquivo(fr), frs: [{ fr, bytes }], aoImprimir };
    await usarPdf(podeCompartilharPdf() ? 'compartilhar' : 'abrir');
  }

  // Várias FRs numa impressão só (cada FR em uma folha, frente e verso). aoImprimir(frs) como acima.
  async function imprimirVarias(lista, aoImprimir) {
    const frs = [];
    for (const fr of lista) frs.push({ fr, bytes: await global.FrPdf.gerar(fr) });
    const bytes = frs.length === 1 ? frs[0].bytes : await global.FrPdf.juntar(frs.map(p => p.bytes));
    const [a, m, d] = (lista[0].data || hoje()).split('-');
    ultimoPdf = { bytes, nome: frs.length === 1 ? nomeArquivo(lista[0]) : `FRs_${d}-${m}-${a}.pdf`, frs, aoImprimir };
    await usarPdf('imprimir');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#btnImprimirPdf').addEventListener('click', () => usarPdf('imprimir'));
    $('#btnAbrirPdf').addEventListener('click', () => {
      const u = ultimoPdf;
      if (!u) return;
      fecharFolha('folhaPdf');
      verFr(u.frs[0].fr, { acoes: [{ rotulo: 'Imprimir', principal: true, fn: () => { ultimoPdf = u; usarPdf('imprimir'); } }] });
    });
    $('#btnCompartilharPdf').addEventListener('click', () => usarPdf(podeCompartilhar ? 'compartilhar' : 'abrir'));
  });

  global.FR = {
    $, $$, ler, gravar, hoje, agora, dataCurta, numero, escapar,
    avisar, abrirFolha, fecharFolha, fecharFolhas, confirmar, mostrarTela,
    perfil, salvarPerfil, ITENS, GRUPO_ITEM, ehDefeito, defeitosSemDescricao,
    estado, frNova, salvarLocal, salvarAgora, sincronizar,
    compartilhadas, convidada, usarConvidada, frAtual, frFicha, preparadas, ehChefe, paraLocal, nomeArquivo,
    lembrarLocal, locaisFrequentes, historicoLocais, chaveLocal, sugerirLocais, registrarLocal, reenviarLocais, autocompletarLocal, lembrarDescricao, descricoesRecentes, textoDefeitos, checklistTudoOk,
    dpiTela, menuAcoes, nativo, plugin, gerarEMostrarPdf, imprimirVarias, verFr, verPdf, acoesPdf, compartilharFr, podeCompartilharPdf, fecharVisor, medidor, aplicarCorrecaoKm, alertar, kmMenor, alertaLicenciamento, placaHtml,
  };
})(window);
