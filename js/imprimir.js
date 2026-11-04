// FR - impressão na versão site (PWA). O Chrome do Android não tem botão de imprimir no leitor de PDF:
// aqui o PDF da FR vira imagem (pdf.js, carregado só na hora) e vai direto para a tela de impressão.
// No APK quem imprime é o plugin nativo FrPdf.imprimir (já escolhe A4 e frente e verso).

(function (global) {
  let pdfjs = null;
  const url = caminho => new URL(caminho, document.baseURI).href;

  async function carregar() {
    if (!pdfjs) {
      pdfjs = await import(url('vendor/pdfjs/pdf.min.js'));
      pdfjs.GlobalWorkerOptions.workerSrc = url('vendor/pdfjs/pdf.worker.min.js');
    }
    return pdfjs;
  }

  // 200 dpi: nítido no papel e leve para o celular
  const ESCALA = 200 / 72;

  async function imprimir(bytes, nome) {
    const lib = await carregar();
    // cópia: o pdf.js consome o buffer; sem eval (a CSP do site não deixa)
    const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const caixa = document.getElementById('impressao');
    caixa.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
    caixa.innerHTML = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: ESCALA });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const img = new Image();
      img.alt = `Página ${n}`;
      img.src = URL.createObjectURL(blob);
      await img.decode();
      caixa.appendChild(img);
    }
    doc.destroy();
    // O título vira o nome do trabalho de impressão (e do arquivo, em "Salvar como PDF")
    const antes = document.title;
    document.title = nome.replace(/\.pdf$/i, '');
    const voltar = () => { window.removeEventListener('afterprint', voltar); setTimeout(() => { document.title = antes; }, 1000); };
    window.addEventListener('afterprint', voltar);
    window.print();
  }

  // Uma página do PDF como imagem (prévia do papel no computador). Devolve o endereço da imagem.
  async function imagem(bytes, n = 1, dpi = 110) {
    const lib = await carregar();
    const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const pagina = await doc.getPage(n);
    const vp = pagina.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    doc.destroy();
    return URL.createObjectURL(blob);
  }

  global.FrImprimir = { imprimir, imagem };
})(window);
