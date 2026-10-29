// FR - mapa de onde cada informação entra no template_FR.pdf.
// Coordenadas em pontos do PDF (origem no canto inferior esquerdo, como o pdf-lib usa),
// medidas das linhas da própria tabela do template (página A4: 595 x 842).
// Célula = { x0, x1, y0, y1 }: o texto é centralizado na vertical e encolhe para caber na largura.

(function (global) {
  // Checklist: o "OK" ou "X" vai entre os parênteses "(   )" de cada item.
  // `x` é o centro do espaço entre os parênteses; `y` é a linha de base do texto do item.
  const COL_A = 44.0, COL_B = 291.0, COL_C = 185.0, COL_D = 366.5;

  const CHECKLIST = [
    { grupo: '1º) Antes de ligar o veículo', itens: [
      { id: 'documentos',   nome: 'Documentos (veículo / pessoal)', x: COL_A, y: 375.3 },
      { id: 'cartao',       nome: 'Cartão de Abastecimento',        x: COL_A, y: 361.8 },
      { id: 'oleo_hidr',    nome: 'Óleo do Motor e Hidráulico',     x: COL_A, y: 348.2 },
      { id: 'agua',         nome: 'Água do Radiador',               x: COL_A, y: 334.6 },
      { id: 'oleo_motor',   nome: 'Óleo do Motor',                  x: COL_A, y: 321.1 },
      { id: 'pneus',        nome: 'Pneus',                          x: COL_A, y: 307.5 },
      { id: 'bateria',      nome: 'Bateria e cabos elétricos',      x: COL_A, y: 294.0 },
      { id: 'velocimetro',  nome: 'Velocímetro / Odômetro / Tacógrafo', x: COL_A, y: 280.4 },
      { id: 'limpador',     nome: 'Limpador de Para-brisa',         x: COL_B, y: 375.3 },
      { id: 'iluminacao',   nome: 'Iluminação Externa',             x: COL_B, y: 361.8 },
      { id: 'buzina',       nome: 'Buzina',                         x: COL_B, y: 348.2 },
      { id: 'extintor',     nome: 'Extintor',                       x: COL_B, y: 334.6 },
      { id: 'macaco',       nome: 'Macaco',                         x: COL_B, y: 321.1 },
      { id: 'chave_rodas',  nome: 'Chave de Rodas',                 x: COL_B, y: 307.5 },
      { id: 'estepe',       nome: 'Estepe',                         x: COL_B, y: 294.0 },
      { id: 'triangulo',    nome: 'Triângulo',                      x: COL_B, y: 280.4 },
    ] },
    { grupo: '2º) Durante o serviço', itens: [
      { id: 'direcao',      nome: 'Direção',                        x: COL_A, y: 233.7 },
      { id: 'susp_diant',   nome: 'Suspensão Dianteira',            x: COL_A, y: 220.2 },
      { id: 'susp_tras',    nome: 'Suspensão Traseira',             x: COL_A, y: 206.6 },
      { id: 'freios',       nome: 'Sistema de Freios',              x: COL_A, y: 193.0 },
      { id: 'embreagem',    nome: 'Embreagem',                      x: COL_C, y: 233.7 },
      { id: 'temperatura',  nome: 'Temperatura do motor',           x: COL_C, y: 220.2 },
      { id: 'vazamento',    nome: 'Vazamento em geral',             x: COL_C, y: 206.6 },
      { id: 'alternador',   nome: 'Alternador',                     x: COL_C, y: 193.0 },
    ] },
    // Após os serviços: X quer dizer "não foi feito" (abastecer, limpar), não é defeito do veículo
    { grupo: '3º) Após os serviços', semDefeito: true, itens: [
      { id: 'abastecimento', nome: 'Abastecimento do Tanque',       x: COL_D, y: 233.7 },
      { id: 'limp_externa',  nome: 'Conservação da Limpeza Externa', x: COL_D, y: 220.2 },
      { id: 'limp_interna',  nome: 'Conservação da Limpeza Interna', x: COL_D, y: 206.6 },
    ] },
  ];

  // Bordas das 16 linhas do itinerário (página 2), de cima para baixo
  const ITIN_LINHAS = [662.9, 637.2, 611.5, 585.8, 560.2, 534.5, 508.8, 483.1,
    457.4, 431.8, 406.1, 380.4, 354.8, 329.1, 303.4, 277.7, 252.0];

  function linhas(bordas, x0, x1) {
    const out = [];
    for (let i = 0; i < bordas.length - 1; i++) out.push({ x0, x1, y0: bordas[i + 1], y1: bordas[i] });
    return out;
  }

  global.FR_LAYOUT = {
    pagina1: {
      numero:     { x0: 128.1, x1: 234.6, y0: 694.8, y1: 707.0 },
      tombamento: { x0: 33.0,  x1: 174.2, y0: 659.0, y1: 677.9 },
      marca:      { x0: 174.2, x1: 355.6, y0: 659.0, y1: 677.9 },
      modelo:     { x0: 355.6, x1: 464.4, y0: 659.0, y1: 677.9 },
      placa:      { x0: 464.4, x1: 569.8, y0: 659.0, y1: 677.9 },
      condutor:   { x0: 33.0,  x1: 219.6, y0: 620.3, y1: 643.3 },
      rgf:        { x0: 219.6, x1: 280.0, y0: 620.3, y1: 643.3 },
      cargo:      { x0: 280.0, x1: 464.4, y0: 620.3, y1: 643.3 },
      // "Unidade" já vem impresso como SMSUZ no template

      // 6 linhas da descrição dos serviços
      descricao: linhas([589.2, 575.0, 561.5, 548.0, 534.4, 520.8, 507.3], 36, 563),

      partida_km:   { x0: 33.0,  x1: 143.9, y0: 455.2, y1: 469.4 },
      partida_hora: { x0: 143.9, x1: 219.6, y0: 455.2, y1: 469.4 },
      retorno_km:   { x0: 33.0,  x1: 143.9, y0: 426.0, y1: 441.6 },
      retorno_hora: { x0: 143.9, x1: 219.6, y0: 426.0, y1: 441.6 },

      // Coluna "Colocar X" do combustível
      combustivel: {
        cheio: { x0: 295.1, x1: 355.6, y0: 469.4, y1: 482.9 },
        '3/4': { x0: 295.1, x1: 355.6, y0: 455.2, y1: 469.4 },
        '1/2': { x0: 295.1, x1: 355.6, y0: 441.6, y1: 455.2 },
        '1/4': { x0: 295.1, x1: 355.6, y0: 426.0, y1: 441.6 },
      },

      // "Horário : ______________" da portaria (o "Visto / RGF" fica para a portaria assinar)
      portaria_hora: { x0: 450.0, x1: 519.0, y0: 471.0, y1: 482.0 },

      checklist: CHECKLIST,

      // 3 linhas de "Defeitos / Avarias"
      defeitos: linhas([129.5, 116.0, 102.4, 88.8], 36, 563),

      // "Data: ______/_______/_________": centro de cada trecho sublinhado
      data: { y: 71.0, dia: 92.6, mes: 130.2, ano: 175.5 },
    },

    pagina2: {
      itinerario: ITIN_LINHAS.slice(0, -1).map((topo, i) => {
        const y0 = ITIN_LINHAS[i + 1], y1 = topo;
        return {
          saida_km:     { x0: 33.0,  x1: 96.4,  y0, y1 },
          saida_hora:   { x0: 96.4,  x1: 159.1, y0, y1 },
          local:        { x0: 159.1, x1: 416.1, y0, y1 },
          chegada_km:   { x0: 416.1, x1: 480.9, y0, y1 },
          chegada_hora: { x0: 480.9, x1: 569.8, y0, y1 },
        };
      }),
      // 7 linhas do "Descritivo resumido de ocorrências"
      ocorrencias: linhas([226.4, 200.6, 175.0, 149.3, 123.6, 98.0, 72.3, 46.6], 36, 563),
    },
  };
})(window);
