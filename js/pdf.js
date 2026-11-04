// FR - preenche o template_FR.pdf com os dados do formulário (pdf-lib, tudo no celular).
// Cada geração parte de uma cópia limpa do template, então gerar de novo não sobrepõe textos.

(function (global) {
  const { PDFDocument, StandardFonts, rgb } = global.PDFLib;
  const L = global.FR_LAYOUT;
  const TINTA = rgb(0.05, 0.1, 0.35); // azul de caneta, para destacar o que foi preenchido
  const TAM_MAX = 9;
  const TAM_MIN = 6;

  let templateBytes = null;
  let fonteMedida = null; // Helvetica para medir texto antes de gerar (avisos de "não cabe")

  async function carregar() {
    if (templateBytes) return;
    const resp = await fetch('assets/template_FR.pdf');
    if (!resp.ok) throw new Error('Modelo da FR não encontrado no app');
    templateBytes = await resp.arrayBuffer();
    const tmp = await PDFDocument.create();
    fonteMedida = await tmp.embedFont(StandardFonts.Helvetica);
  }

  // Helvetica padrão só conhece WinAnsi: troca o que não existir (emoji etc.) para não quebrar a geração
  function limpar(texto) {
    return String(texto || '')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/[^\x20-\x7E -ÿ\n]/g, '')
      .toLocaleUpperCase('pt-BR');
  }

  // Quebra o texto em linhas que caibam em `largura`, tentando tamanhos de fonte do maior ao menor
  function quebrar(fonte, texto, largura, maxLinhas) {
    const paragrafos = limpar(texto).split('\n').map(p => p.trim()).filter(Boolean);
    for (let tam = TAM_MAX; tam >= TAM_MIN; tam -= 0.5) {
      const linhas = [];
      for (const par of paragrafos) {
        let atual = '';
        for (const palavra of par.split(/\s+/)) {
          const tentativa = atual ? atual + ' ' + palavra : palavra;
          if (fonte.widthOfTextAtSize(tentativa, tam) <= largura) { atual = tentativa; continue; }
          if (atual) linhas.push(atual);
          atual = palavra;
          // Palavra sozinha maior que a linha: corta em pedaços
          while (fonte.widthOfTextAtSize(atual, tam) > largura) {
            let n = atual.length - 1;
            while (n > 1 && fonte.widthOfTextAtSize(atual.slice(0, n), tam) > largura) n--;
            linhas.push(atual.slice(0, n));
            atual = atual.slice(n);
          }
        }
        if (atual) linhas.push(atual);
      }
      if (linhas.length <= maxLinhas) return { linhas, tam, cabe: true };
      if (tam === TAM_MIN) return { linhas: linhas.slice(0, maxLinhas), tam, cabe: false };
    }
    return { linhas: [], tam: TAM_MAX, cabe: true };
  }

  // Para o formulário avisar antes de gerar: { cabe, usadas, total }
  function medir(campo, texto) {
    if (!fonteMedida) return null;
    const celulas = campo === 'ocorrencias' ? L.pagina2.ocorrencias : L.pagina1[campo];
    const largura = celulas[0].x1 - celulas[0].x0;
    const r = quebrar(fonteMedida, texto, largura, celulas.length);
    return { cabe: r.cabe, usadas: r.linhas.length, total: celulas.length };
  }

  function escreverNaCelula(page, fonte, texto, cel, alinhar = 'centro') {
    texto = limpar(texto).replace(/\s+/g, ' ').trim();
    if (!texto) return;
    const largura = cel.x1 - cel.x0 - 4;
    // Célula alta (itinerário): texto comprido quebra em 2 linhas em vez de ficar minúsculo
    if (cel.y1 - cel.y0 > 20 && fonte.widthOfTextAtSize(texto, TAM_MAX) > largura) {
      const { linhas, tam } = quebrar(fonte, texto, largura, 2);
      const meio = (cel.y0 + cel.y1) / 2, passo = tam * 1.15;
      linhas.forEach((linha, i) => {
        const x = alinhar === 'esquerda' ? cel.x0 + 2 : cel.x0 + (cel.x1 - cel.x0 - fonte.widthOfTextAtSize(linha, tam)) / 2;
        page.drawText(linha, { x, y: meio + passo * (0.5 - i) - tam * 0.35, size: tam, font: fonte, color: TINTA });
      });
      return;
    }
    let tam = TAM_MAX;
    while (tam > TAM_MIN && fonte.widthOfTextAtSize(texto, tam) > largura) tam -= 0.25;
    while (texto.length > 1 && fonte.widthOfTextAtSize(texto, tam) > largura) texto = texto.slice(0, -1);
    const w = fonte.widthOfTextAtSize(texto, tam);
    const x = alinhar === 'esquerda' ? cel.x0 + 2 : cel.x0 + (cel.x1 - cel.x0 - w) / 2;
    // Linha de base: centro da célula menos ~1/3 do tamanho (altura das maiúsculas)
    const y = (cel.y0 + cel.y1) / 2 - tam * 0.35;
    page.drawText(texto, { x, y, size: tam, font: fonte, color: TINTA });
  }

  function escreverParagrafo(page, fonte, texto, celulas) {
    if (!String(texto || '').trim()) return;
    const largura = celulas[0].x1 - celulas[0].x0;
    const { linhas, tam } = quebrar(fonte, texto, largura, celulas.length);
    linhas.forEach((linha, i) => {
      const cel = celulas[i];
      page.drawText(linha, { x: cel.x0, y: (cel.y0 + cel.y1) / 2 - tam * 0.35, size: tam, font: fonte, color: TINTA });
    });
  }

  function escreverCentrado(page, fonte, texto, xCentro, y, tam) {
    const w = fonte.widthOfTextAtSize(texto, tam);
    page.drawText(texto, { x: xCentro - w / 2, y, size: tam, font: fonte, color: TINTA });
  }

  async function gerar(d) {
    await carregar();
    const doc = await PDFDocument.load(templateBytes);
    const fonte = await doc.embedFont(StandardFonts.Helvetica);
    const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
    const [p1, p2] = doc.getPages();
    const A = L.pagina1, B = L.pagina2;

    // O "Número" do papel (número da FR) ninguém usa: fica em branco
    for (const campo of ['tombamento', 'marca', 'modelo', 'placa', 'condutor', 'rgf', 'cargo',
      'partida_km', 'partida_hora', 'retorno_km', 'retorno_hora']) {
      escreverNaCelula(p1, fonte, d[campo], A[campo]);
    }
    escreverNaCelula(p1, fonte, d.portaria_hora, A.portaria_hora);

    escreverParagrafo(p1, fonte, d.descricao, A.descricao);
    escreverParagrafo(p1, fonte, d.defeitos, A.defeitos);

    const nivel = A.combustivel[d.combustivel];
    if (nivel) escreverNaCelula(p1, negrito, 'X', nivel);

    const temInspecao = d.checklist && Object.keys(d.checklist).length > 0;
    for (const grupo of A.checklist) {
      for (const item of grupo.itens) {
        let v = d.checklist && d.checklist[item.id];
        // FR feita quando "Após os serviços" começava em branco: sai com OK no papel
        if (!v && grupo.semDefeito && temInspecao) v = 'ok';
        if (v === 'ok') escreverCentrado(p1, negrito, 'OK', item.x, item.y + 0.6, 6.5);
        else if (v === 'x') escreverCentrado(p1, negrito, 'X', item.x, item.y, 9);
      }
    }

    if (d.data) {
      const [ano, mes, dia] = d.data.split('-');
      escreverCentrado(p1, fonte, dia, A.data.dia, A.data.y, 10);
      escreverCentrado(p1, fonte, mes, A.data.mes, A.data.y, 10);
      escreverCentrado(p1, fonte, ano, A.data.ano, A.data.y, 10);
    }

    (d.itinerario || []).slice(0, B.itinerario.length).forEach((parada, i) => {
      const linha = B.itinerario[i];
      escreverNaCelula(p2, fonte, parada.saida_km, linha.saida_km);
      escreverNaCelula(p2, fonte, parada.saida_hora, linha.saida_hora);
      escreverNaCelula(p2, fonte, parada.local, linha.local, 'esquerda');
      escreverNaCelula(p2, fonte, parada.chegada_km, linha.chegada_km);
      escreverNaCelula(p2, fonte, parada.chegada_hora, linha.chegada_hora);
    });
    escreverParagrafo(p2, fonte, d.ocorrencias, B.ocorrencias);

    doc.setTitle('FR - Relatório Diário de Serviços');
    doc.setProducer('FR Sistema');
    return await doc.save();
  }

  // Várias FRs num arquivo só, para mandar à impressora de uma vez (2 páginas cada: frente e verso)
  async function juntar(lista) {
    const doc = await PDFDocument.create();
    for (const bytes of lista) {
      const outro = await PDFDocument.load(bytes);
      (await doc.copyPages(outro, outro.getPageIndices())).forEach(p => doc.addPage(p));
    }
    doc.setTitle('FRs - Relatório Diário de Serviços');
    doc.setProducer('FR Sistema');
    return await doc.save();
  }

  global.FrPdf = { carregar, gerar, juntar, medir, MAX_PARADAS: L.pagina2.itinerario.length };
})(window);
