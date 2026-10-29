// FR - desenhos dos tipos de veículo (de lado, traço simples) e a figura de pessoa da equipe.
// O tipo fica no cadastro do veículo (campo "tipo"); veículo antigo, sem tipo, é adivinhado pelo modelo.

(function (global) {
  const F = global.FR;

  // Rodas por cima do traço do chassi (o miolo pinta com a cor do fundo do cartão)
  const roda = (x, y, r) => `<circle class="ic-roda" cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y}" r="${(r / 3).toFixed(1)}"/>`;
  const TIPOS = [
    ['carro', 'Carro', '<path d="M4 23v-5c0-1.3.8-2.2 2-2.4l6-1.1 5-5.3c.6-.7 1.4-1.1 2.3-1.1h10.4c.9 0 1.7.4 2.3 1.1l5 5.3 4 .9c1.2.3 2 1.3 2 2.6V23z"/><path d="M14.5 14.5 18.6 10h5.9v4.5zM27.5 10h3.6l4.2 4.5h-7.8z"/>' + roda(13, 23, 4.2) + roda(35, 23, 4.2)],
    ['caminhonete', 'Caminhonete', '<path d="M3 23v-6c0-1 .7-1.8 1.7-2l6.3-1.2 3.7-5.2c.5-.7 1.3-1.1 2.1-1.1H25v7h18c.6 0 1 .4 1 1V23z"/><path d="M13.5 13.6 16.6 9.3h5.9v4.3z"/>' + roda(12, 23, 4.2) + roda(35, 23, 4.2)],
    ['van', 'Van', '<path d="M4 23V11c0-2.2 1.8-4 4-4h27c1.4 0 2.7.7 3.4 1.9L43 16.5c.6.9 1 2 1 3.1V23z"/><path d="M8 10.5h8v5H8zM19.5 10.5h8v5h-8zM31 10.5h5l3 5h-8z"/>' + roda(12, 23, 4.2) + roda(36, 23, 4.2)],
    ['caminhao', 'Caminhão', '<path d="M2 5h27v18H2z"/><path d="M29 10h8.5c.9 0 1.7.4 2.2 1.1l4 5.4c.2.3.3.7.3 1.1V23H29z"/><path d="M32.5 13h4.5l3 4h-7.5z"/>' + roda(9, 24, 4) + roda(19, 24, 4) + roda(37, 24, 4)],
    ['retro', 'Retroescavadeira', '<path d="M9 20h28v-5H9z"/><path d="M13 15V6h11l2 9"/><path d="M15.5 8.5h6.5v6.5h-6.5z"/><path d="M37 16.5l5 4.5"/><path d="M40.5 19h6.5v6l-4.5 0z"/><path d="M9 16 4 8 1.5 14"/><path d="M1.5 14 1 18.5 5 18"/>' + roda(15, 24, 5) + roda(33, 25, 3.8)],
    ['patrol', 'Motoniveladora (patrol)', '<path d="M2 21h18v-7H2z"/><path d="M6 14V6h11v8"/><path d="M8.5 8.5h6v5.5h-6z"/><path d="M20 15.5h21.5l2 5"/><path d="M28 15.5v6.5"/><path d="M22.5 25.5 33 22.5"/>' + roda(6, 25, 3.8) + roda(15, 25, 3.8) + roda(43, 25, 3.8)],
    ['trator', 'Trator', '<path d="M20 19h22v-6H20z"/><path d="M8 15V4h12v11"/><path d="M10.5 6.5h7v8h-7z"/><path d="M31 13V7.5"/>' + roda(13, 22, 7.5) + roda(37, 25, 4.5)],
    ['rolo', 'Rolo compactador', '<path d="M7 19h29v-5H7z"/><path d="M10 14V5h12v9"/><path d="M12.5 7.5h7v6.5h-7z"/><path d="M30 14l4.5 4"/>' + roda(10, 24, 4.5) + '<rect class="ic-roda" x="29.5" y="17" width="15" height="13" rx="6.5"/>'],
  ];
  const svg = corpo => `<svg class="ic-veiculo" viewBox="0 0 48 32" aria-hidden="true">${corpo}</svg>`;

  // Veículo sem tipo (cadastro antigo): adivinha pelo nome
  function tipoVeiculo(v) {
    if (v && v.tipo && TIPOS.some(t => t[0] === v.tipo)) return v.tipo;
    const n = [v && v.marca, v && v.modelo].join(' ').toLowerCase();
    if (/retro|backhoe|416|580/.test(n)) return 'retro';
    if (/patrol|niveladora|motoniv|120k|140k|rg ?140/.test(n)) return 'patrol';
    if (/rolo|compact/.test(n)) return 'rolo';
    if (/trator|massey|valtra|new holland tl/.test(n)) return 'trator';
    if (/caminh|basculante|accelo|atego|delivery|cargo|constellation|worker|tector|vm ?2/.test(n)) return 'caminhao';
    if (/van|ducato|sprinter|master|daily|boxer|jumper/.test(n)) return 'van';
    if (/saveiro|strada|montana|hilux|s10|ranger|toro|amarok|l200|oroch|frontier/.test(n)) return 'caminhonete';
    if (v && v.medidor === 'horimetro') return 'retro';
    return 'carro';
  }
  const iconeVeiculo = v => {
    const t = TIPOS.find(x => x[0] === tipoVeiculo(v));
    return `<span class="veiculo-icone" title="${t[1]}">${svg(t[2])}</span>`;
  };

  // Pessoa da equipe: figura padrão; o chefe ganha o capacete
  const iconePessoa = chefe => `<span class="pessoa-icone${chefe ? ' pessoa-chefe' : ''}"><svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="12.5" r="5.5"/><path d="M5.5 28c1.4-5.4 5.6-8.5 10.5-8.5s9.1 3.1 10.5 8.5"/>
      ${chefe ? '<path class="pessoa-capacete" d="M9.8 10.2c0-3.9 2.8-6.6 6.2-6.6s6.2 2.7 6.2 6.6zM8.5 10.2h15"/>' : ''}</svg></span>`;

  // Ícones dos botões de ação (traço simples, cor do texto do botão). Filtros e listas de nomes não levam ícone.
  const IC = {
    mais: '<path d="M12 5v14M5 12h14"/>',
    imprimir: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    backup: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
    telaCheia: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><circle cx="11.5" cy="14" r="2.5"/><path d="m13.5 16 2 2"/>',
    editar: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    reabrir: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    passar: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 11-4.7"/><path d="M15 17h6M18.5 14.5 21 17l-2.5 2.5"/>',
    papel: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="m9 10 2 2 4-4"/>',
    cancelar: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    km: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/><path d="M4 17h2M18 17h2"/>',
    compartilhar: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    trocar: '<path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5"/><path d="M20 16H6M9.5 12.5 6 16l3.5 3.5"/>',
    excluir: '<path d="M4 7h16M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    pontos: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    baixar: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 20h14"/>',
    abrir: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    bandeira: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    colega: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M18 8v6M15 11h6"/>',
    ficha: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    salvar: '<path d="M5 12.5 10 17l9-10"/>',
    veiculo: '<path d="M3 16v-4l2-5h11l3 5h2v4z"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  };
  const ic = nome => IC[nome] ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[nome]}</svg>` : '';

  Object.assign(F, {
    ic,
    TIPOS_VEICULO: TIPOS.map(([id, nome, corpo]) => ({ id, nome, svg: svg(corpo) })),
    tipoVeiculo, iconeVeiculo, iconePessoa,
  });
})(window);
