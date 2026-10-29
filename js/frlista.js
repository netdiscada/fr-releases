// FR - peças comuns da lista de FRs (chefe e ADM usam as mesmas): o cartão de cada FR (placa, quem,
// situação e botões dentro da caixa) e o papel da FR clicada, ao lado no computador ou numa mini janela
// no celular. O papel também serve para a prévia do "Preparar FR" e da ficha completa.

(function (global) {
  const F = global.FR;
  const { $, $$, escapar } = F;

  // ---------- papel ----------
  // criarPapel(el): mostrar(fr) desenha frente e verso em el, na largura toda (nitidez pelo tamanho da tela).
  // Repetir a mesma FR não refaz. Sem zoom: a folha ocupa o espaço que a tela dá.
  function criarPapel(el) {
    let chave = null, urls = [], vez = 0;
    el.classList.add('papel');
    el.innerHTML = '<div class="papel-folhas"><div class="vazio"><div class="girando"></div></div></div>';
    const folhas = $('.papel-folhas', el);
    return {
      async mostrar(fr) {
        const k = JSON.stringify(fr);
        if (k === chave) return;
        chave = k;
        const minha = ++vez;
        try {
          const bytes = await global.FrPdf.gerar(fr);
          const dpi = F.dpiTela(el.clientWidth || 400);
          const novas = [await global.FrImprimir.imagem(bytes, 1, dpi), await global.FrImprimir.imagem(bytes, 2, dpi)];
          if (minha !== vez) { novas.forEach(u => URL.revokeObjectURL(u)); return; }
          urls.forEach(u => URL.revokeObjectURL(u));
          urls = novas;
          folhas.innerHTML = urls.map((u, i) => `<img src="${u}" alt="FR, ${i ? 'verso' : 'frente'}">`).join('');
        } catch (e) {
          console.warn('[papel]', e);
          if (minha === vez) folhas.innerHTML = '<p class="dica">Não foi possível mostrar o papel desta FR.</p>';
        }
      },
      limpar() { vez++; chave = null; urls.forEach(u => URL.revokeObjectURL(u)); urls = []; },
    };
  }

  // ---------- cartão de uma FR ----------
  // acoes: [[nome, rótulo, 'perigo'?]] na ordem de importância; os botões chamam opcoes.acoes[nome](f) (ver ligar).
  // Padrão do app: no máximo 4 botões no computador e 3 no celular, todos do mesmo tamanho;
  // o que passar disso vai para o "⋯ Mais".
  let selecionada = null;
  const extras = {};
  // Ícone de cada ação (o mesmo em todo o app)
  const ICONE = { pdf: 'pdf', imprimir: 'imprimir', editar: 'editar', passar: 'passar', papel: 'papel', cancelar: 'cancelar',
    liberar: 'reabrir', reabrir: 'reabrir', compartilhar: 'compartilhar', trocar: 'trocar', excluir: 'excluir' };
  const icone = (acao, rotulo) => (rotulo === 'Anotar km' ? 'km' : ICONE[acao]);
  const vagas = () => (matchMedia('(min-width: 700px)').matches ? 4 : 3);
  function cartao({ f, titulo, sub, status, classe, detalhe, km, selo, acoes = [], aviso = '' }) {
    const n = vagas();
    const visiveis = acoes.length > n ? acoes.slice(0, n - 1) : acoes;
    extras[f.id] = acoes.slice(visiveis.length);
    const botao = ([a, r, c]) => `<button type="button" class="link ${c === 'perigo' ? 'link-perigo' : ''}" data-acao="${a}">${F.ic(icone(a, r))}<span>${r}</span></button>`;
    return `<div class="cartao fr-linha${f.id === selecionada ? ' fr-sel' : ''}" data-fr="${escapar(f.id)}" tabindex="0">
      <div class="fr-topo">${F.placaHtml(f)}<span class="frota-nome"><b>${escapar(titulo)}</b><small>${escapar(sub)}</small></span>
        <span class="fr-dir">${km ? `<b class="frota-km">${escapar(km)}</b>` : ''}${selo || ''}</span></div>
      ${aviso}<div class="fr-baixo"><span class="fr-situacao"><small class="status-${classe}">${escapar(status)}</small><small>${escapar(detalhe || '')}</small></span>
        ${acoes.length ? `<div class="acoes" style="--n: ${n}">${visiveis.map(botao).join('')}${extras[f.id].length ? `<button type="button" class="link link-mais" data-mais>${F.ic('pontos')}<span>Mais</span></button>` : ''}</div>` : ''}</div>
    </div>`;
  }

  // Lista à esquerda; no computador, o papel da FR clicada à direita (como a prévia do Explorador de Arquivos).
  // Os dois lados começam com um título, para as caixas ficarem alinhadas.
  const previaVazia = '<div class="previa-vazia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg><p>Clique numa FR para ver o papel aqui.</p></div>';
  const painel = lista => `<div class="painel-frs"><div class="lista-frs">${lista}</div>
    <aside class="previa-fr"><h3 class="secao">Papel da FR</h3><div class="previa-caixa">${previaVazia}</div></aside></div>`;

  // ---------- liga os cartões ----------
  // opcoes: { acoes: { nome: f => … }, podeVer: f => bool, bloqueada: f => texto, imprimir: f => …, verPdf: f => … }
  let opcoes = null, lista = [], raiz = document;
  // A caixa do papel desta tela (o chefe e o ADM têm cada um a sua)
  const caixaPapel = () => $('.previa-caixa', raiz);
  const comPainel = () => matchMedia('(min-width: 1000px)').matches;
  let papelPc = null, papelMini = null;

  function ligar(caixa, frs, o) {
    opcoes = o;
    lista = frs;
    raiz = caixa;
    papelPc = null;
    const achar = el => lista.find(x => x.id === el.closest('[data-fr]').dataset.fr);
    $$('[data-fr] [data-acao]', caixa).forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const f = achar(b);
      if (f && o.acoes[b.dataset.acao]) o.acoes[b.dataset.acao](f);
    }));
    $$('[data-fr] [data-mais]', caixa).forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      const f = achar(b);
      if (!f) return;
      F.menuAcoes(f.condutor || 'FR', [F.dataCurta(f.data), f.placa].filter(Boolean).join(' · '),
        (extras[f.id] || []).map(([a, r, c]) => ({ rotulo: r, icone: icone(a, r), perigo: c === 'perigo', fn: () => o.acoes[a](f) })));
    }));
    $$('[data-fr]', caixa).forEach(el => {
      const abrirFr = () => { const f = achar(el); if (f) mostrar(f, true); };
      el.addEventListener('click', abrirFr);
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target === el) abrirFr(); });
    });
    // Depois de redesenhar (mudança no banco), a FR escolhida continua no painel
    const f = selecionada && lista.find(x => x.id === selecionada);
    if (f) mostrar(f, false);
  }

  const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>';
  const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 13.4 10.6 12 12l6.3 6.3-1.4 1.4L12 14.8l-4.9 4.9-1.4-1.4L10.6 12 5.7 7.1l1.4-1.4L12 10.6l4.9-4.9z"/></svg>';

  function mostrar(f, clicou) {
    const pc = comPainel() && caixaPapel();
    // No celular só abre quando a pessoa toca (não reabre sozinha quando o banco muda)
    if (!pc && !clicou && $('#folhaPrevia').hidden) return;
    const alvo = pc || $('#previaMini');
    selecionada = f.id;
    if (pc) $$('.fr-linha').forEach(el => el.classList.toggle('fr-sel', el.dataset.fr === f.id));
    // Celular: Voltar no canto de cima à esquerda, como no resto do app. Computador: X fecha o painel.
    const quem = `<span><b>${escapar(f.condutor || '')}</b><small>${escapar([F.dataCurta(f.data), f.placa, [f.marca, f.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</small></span>`;
    const cab = pc ? `<div class="previa-cab">${quem}<button type="button" class="icone-btn" data-p="fechar" aria-label="Fechar">${X}</button></div>`
      : `<div class="previa-cab"><button type="button" class="icone-btn btn-voltar" data-p="fechar">${SETA}<span>Voltar</span></button>${quem}</div>`;
    const podeVer = !opcoes.podeVer || opcoes.podeVer(f);
    if (!podeVer) {
      if (pc) papelPc = null;
      alvo.innerHTML = cab + `<div class="previa-vazia"><p>${escapar(opcoes.bloqueada ? opcoes.bloqueada(f) : 'O papel desta FR não está disponível.')}</p></div>`;
    } else {
      const botoes = pc
        ? `<button type="button" class="btn btn-claro" data-p="pdf">${F.ic('telaCheia')}Tela cheia</button><button type="button" class="btn btn-principal" data-p="imprimir">${F.ic('imprimir')}Imprimir</button>`
        : `<button type="button" class="btn btn-claro" data-p="pdf">${F.ic('telaCheia')}Tela cheia</button><button type="button" class="btn btn-principal" data-p="imprimir">${F.ic('imprimir')}Imprimir</button>`;
      // O papel do painel fica montado entre um redesenho e outro (só refaz se a FR mudou)
      const reusar = pc && papelPc && $('.papel', alvo) && alvo.dataset.fr === f.id;
      if (!reusar) {
        alvo.innerHTML = cab + `<div class="previa-acoes">${botoes}</div><div></div>`;
        const p = criarPapel(alvo.lastElementChild);
        if (pc) papelPc = p; else { if (papelMini) papelMini.limpar(); papelMini = p; }
      }
      alvo.dataset.fr = f.id;
      (pc ? papelPc : papelMini).mostrar(f);
      $('.papel-folhas', alvo).onclick = () => { if (!pc) F.fecharFolha('folhaPrevia'); opcoes.verPdf(f); };
    }
    $$('[data-p]', alvo).forEach(b => { b.onclick = () => {
      if (b.dataset.p === 'fechar') { fechar(); return; }
      if (!pc) F.fecharFolha('folhaPrevia');
      (b.dataset.p === 'pdf' ? opcoes.verPdf : opcoes.imprimir)(f);
    }; });
    if (!pc) F.abrirFolha('folhaPrevia');
  }

  function fechar() {
    selecionada = null;
    F.fecharFolha('folhaPrevia');
    $$('.fr-linha').forEach(el => el.classList.remove('fr-sel'));
    const caixa = caixaPapel();
    if (caixa) { caixa.innerHTML = previaVazia; delete caixa.dataset.fr; }
    papelPc = null;
  }

  global.FrLista = { cartao, painel, ligar, fechar, criarPapel, comPainel };
})(window);
