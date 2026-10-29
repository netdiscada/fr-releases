// FR - animações: fundo de asfalto correndo com o carro andando, hodômetro de painel que gira, a troca
// de telas, a placa PARE ao encerrar e um gesto curto e próprio em cada botão (chave na ignição,
// carro que puxa a tela, folha que vai para a lixeira, ficha que folheia, avião de papel...).
// Tudo com transform/opacity (leve para celular simples). Desliga sozinho com "reduzir movimento"
// do aparelho e pelo menu (Animações: desligadas). Nenhum gesto passa de ~0,6 s antes de seguir.

(function (global) {
  const F = global.FR;
  const { escapar } = F;
  const CHAVE = 'fr.animacoes.v1';
  const reduzir = global.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const ligado = () => !reduzir.matches && F.ler(CHAVE, 'on') !== 'off';
  function aplicar() { document.documentElement.classList.toggle('sem-anim', !ligado()); }
  aplicar();
  if (reduzir.addEventListener) reduzir.addEventListener('change', aplicar);
  function alternar() { F.gravar(CHAVE, ligado() ? 'off' : 'on'); aplicar(); return ligado(); }
  // Um toque curto no celular (onde existir)
  const vibrar = p => { try { if (ligado() && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* sem vibração */ } };
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  // Espera o gesto do botão terminar (sem animação, segue na hora)
  const pausa = ms => ligado() ? esperar(ms) : Promise.resolve();
  // Peça solta por cima da tela, que some sozinha
  function solta(classe, html, ms, estilo) {
    const el = document.createElement('div');
    el.className = classe;
    el.setAttribute('aria-hidden', 'true');
    if (estilo) el.style.cssText = estilo;
    el.innerHTML = html;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }

  // =====================================================================
  // Hodômetro de painel: cada dígito é uma fita de 0 a 9 que gira até o número
  // =====================================================================
  const ultimos = {}; // último valor mostrado em cada hodômetro (por chave): só gira o que mudou
  function digitos(texto, chave) {
    texto = String(texto);
    const antes = String(ultimos[chave] != null ? ultimos[chave] : texto.replace(/\d/g, '0'));
    ultimos[chave] = texto;
    // Alinha pela direita: o dígito de antes na mesma casa (para girar de lá até o novo)
    const deDig = antes.replace(/\D/g, '').padStart(16, '0');
    let n = texto.replace(/\D/g, '').length;
    const fita = '<span class="od-fita">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<i>${d}</i>`).join('') + '</span>';
    return Array.from(texto).map(c => {
      if (!/\d/.test(c)) return `<span class="od-sep">${c === ' ' ? '' : escapar(c)}</span>`;
      n--;
      const de = deDig[deDig.length - 1 - n] || '0';
      return `<span class="od-dig" data-de="${de}" data-para="${c}" style="--d:${ligado() ? de : c}">${fita}</span>`;
    }).join('');
  }
  // Depois de pôr na tela: gira do valor de antes até o atual (casa da direita gira por último)
  function rolar(raiz) {
    const lista = Array.from((raiz || document).querySelectorAll('.od-dig'));
    if (!lista.length || !ligado()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => lista.forEach((el, i) => {
      if (el.dataset.de === el.dataset.para) return;
      // Transform direto na fita (sem mudar variável no pai: não recalcula os filhos)
      const fita = el.firstElementChild;
      fita.style.transitionDelay = (i * 60) + 'ms';
      fita.style.transform = `translateY(${-1.22 * Number(el.dataset.para)}em)`;
    })));
  }

  // =====================================================================
  // Fundo da tela inicial: a tela inteira é o asfalto, visto de cima, correndo sem parar
  // =====================================================================
  // Caminhonete branca da prefeitura vista de cima (a frente para cima), com o giroflex no teto
  const CARRO_CIMA = `<svg viewBox="0 0 60 112" aria-hidden="true">
      <path class="cc-farol-luz" d="M8 6 L-8 -60 H24 Z M52 6 L68 -60 H36 Z" fill="url(#ccLuz)"/>
      <defs><linearGradient id="ccLuz" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFE7A8" stop-opacity=".5"/><stop offset="1" stop-color="#FFE7A8" stop-opacity="0"/></linearGradient></defs>
      <rect x="2" y="16" width="5" height="16" rx="2" fill="#0B0D10"/><rect x="53" y="16" width="5" height="16" rx="2" fill="#0B0D10"/>
      <rect x="2" y="78" width="5" height="16" rx="2" fill="#0B0D10"/><rect x="53" y="78" width="5" height="16" rx="2" fill="#0B0D10"/>
      <rect x="5" y="4" width="50" height="104" rx="13" fill="#E9EDF2"/>
      <rect x="5" y="4" width="50" height="104" rx="13" fill="none" stroke="#B9C1CB" stroke-width="1.5"/>
      <path d="M11 30 Q30 22 49 30 L46 42 Q30 38 14 42 Z" fill="#1B2733"/>
      <rect x="13" y="42" width="34" height="22" rx="4" fill="#DDE2E8"/>
      <rect class="cc-giro-a" x="15" y="49" width="14" height="6" rx="2" fill="#F2A900"/>
      <rect class="cc-giro-b" x="31" y="49" width="14" height="6" rx="2" fill="#F2A900"/>
      <path d="M14 64 Q30 68 46 64 L46 70 Q30 73 14 70 Z" fill="#1B2733"/>
      <rect x="12" y="74" width="36" height="30" rx="3" fill="#C9D0D8"/>
      <path d="M12 84h36M12 94h36" stroke="#B3BBC5" stroke-width="1.2"/>
      <rect x="9" y="6" width="10" height="4" rx="2" fill="#FFF6D8"/><rect x="41" y="6" width="10" height="4" rx="2" fill="#FFF6D8"/>
      <rect class="cc-lanterna" x="8" y="103" width="11" height="4" rx="2" fill="#E2332B"/><rect class="cc-lanterna" x="41" y="103" width="11" height="4" rx="2" fill="#E2332B"/>
      <path d="M30 8 v18" stroke="#F2A900" stroke-width="3" opacity=".9"/>
    </svg>`;
  // Carro que passa na mão contrária (a frente para baixo)
  const CARRO_VEM = `<svg viewBox="0 0 50 92" aria-hidden="true">
      <rect x="4" y="4" width="42" height="84" rx="12" fill="#3A4E6B"/>
      <path d="M10 62 Q25 68 40 62 L38 52 Q25 55 12 52 Z" fill="#101820"/>
      <rect x="11" y="28" width="28" height="24" rx="4" fill="#33465F"/>
      <path d="M12 26 Q25 22 38 26 L38 20 Q25 17 12 20 Z" fill="#101820"/>
      <rect x="7" y="82" width="9" height="4" rx="2" fill="#FFF6D8"/><rect x="34" y="82" width="9" height="4" rx="2" fill="#FFF6D8"/>
    </svg>`;
  function cena() {
    return `<div class="cena" aria-hidden="true">
      <div class="cena-asfalto"><div class="cena-fita"></div></div>
      <div class="cena-vem">${CARRO_VEM}</div>
      <div class="cena-carro">${CARRO_CIMA}</div>
    </div>`;
  }
  // Depois de começar o dia: o carro chega de baixo e entra na pista
  function chegouNaPista() {
    const c = document.querySelector('#tela-inicio .cena');
    if (!c || !ligado()) return;
    c.classList.remove('chegando');
    void c.offsetWidth;
    c.classList.add('chegando');
  }

  // =====================================================================
  // Troca de telas (View Transitions do navegador; sem suporte, só troca)
  // tipo: 'vem' (avança, entra pela direita), 'volta' (pela esquerda), 'livro' (abre como livro), 'sobe'
  // =====================================================================
  function transicao(fn, tipo = 'vem') {
    if (!ligado() || !document.startViewTransition) { fn(); return; }
    document.documentElement.dataset.vt = tipo;
    try {
      const t = document.startViewTransition(fn);
      t.finished.finally(() => { if (document.documentElement.dataset.vt === tipo) delete document.documentElement.dataset.vt; });
    } catch (e) { fn(); }
  }

  // Troca de tela do app: escolhe o jeito pela direção (a próxima pode ser pedida antes com proxima())
  let pedida = null;
  const proxima = tipo => { pedida = tipo; };
  function trocarTela(antes, nome, fn) {
    const tipo = pedida || (nome === 'ficha' ? 'livro' : nome === 'inicio' || antes === 'ficha' ? 'volta' : antes === 'carregando' ? 'sobe' : 'vem');
    pedida = null;
    if (ligado() && !document.startViewTransition) { fn(); entrar(nome); return; } // navegador antigo: cartões em cascata
    transicao(fn, tipo);
  }

  // =====================================================================
  // Gestos dos botões (curtos; devolvem promessa para a ação seguir quando acabam)
  // =====================================================================
  // Começar o dia: a chave gira na ignição, o painel acende e o motor dá a partida
  const CHAVE_SVG = `<svg class="ign-svg" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".45"/>
      <g class="ign-chave"><rect x="11.5" y="3" width="5" height="12" rx="1.5" fill="currentColor"/><circle cx="14" cy="18" r="5.5" fill="currentColor"/><circle cx="14" cy="18" r="1.8" fill="var(--marca, #F2A900)"/></g>
    </svg>`;
  const chaveIgnicao = () => `<span class="ignicao" aria-hidden="true">${CHAVE_SVG}<i></i><i></i><i></i></span>`;
  function ignicao(botao) {
    if (!ligado() || !botao) return Promise.resolve();
    vibrar([8, 40, 30, 20, 30]);
    botao.classList.remove('ligando');
    void botao.offsetWidth;
    botao.classList.add('ligando');
    return esperar(620);
  }

  // Veículo escolhido: o desenho do carro sai andando e "puxa" a tela para o passo seguinte
  function puxar(cartao) {
    if (!ligado() || !cartao) return Promise.resolve();
    const ic = cartao.querySelector('.veiculo-icone') || cartao;
    const r = ic.getBoundingClientRect();
    vibrar(12);
    const el = solta('anim-puxa', ic.innerHTML + '<span class="puxa-vento"><i></i><i></i><i></i></span>', 900,
      `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`);
    el.style.setProperty('--ate', (innerWidth - r.left + 20) + 'px');
    ic.style.visibility = 'hidden';
    cartao.classList.add('puxado');
    return esperar(380);
  }

  // Ficha completa: as folhas do ícone viram como as de um livro
  function folhear(botao) {
    if (!ligado() || !botao) return Promise.resolve();
    const ic = botao.querySelector('.bloco-ic');
    if (ic) {
      const p = document.createElement('span');
      p.className = 'folhas';
      p.setAttribute('aria-hidden', 'true');
      p.innerHTML = '<i></i><i></i><i></i>';
      ic.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
    vibrar(8);
    return esperar(380);
  }

  // Compartilhar: um aviãozinho sai do ícone
  function envio(botao) {
    if (!ligado() || !botao) return Promise.resolve();
    const ic = botao.querySelector('.bloco-ic, svg') || botao;
    const r = ic.getBoundingClientRect();
    solta('anim-envio', '<svg viewBox="0 0 24 24"><path d="M2 11 22 3l-5 18-5-6z" fill="#F4F4F0"/><path d="M12 15 22 3 8 13z" fill="#C9D1DB"/></svg><span class="envio-rastro"></span>', 800,
      `left:${r.left + r.width / 2 - 11}px;top:${r.top + r.height / 2 - 11}px`);
    vibrar(10);
    return esperar(320);
  }

  // Cancelar a FR: a folha voa para a lixeira, a tampa fecha
  const LIXEIRA = `<svg viewBox="0 0 64 72" aria-hidden="true">
      <g class="lx-tampa"><rect x="6" y="10" width="52" height="7" rx="3" fill="#C9D0D8"/><rect x="24" y="4" width="16" height="7" rx="2.5" fill="#C9D0D8"/></g>
      <path d="M11 20h42l-4 48a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4z" fill="#8E99A6"/>
      <path d="M24 28v34M32 28v34M40 28v34" stroke="#6B7684" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  const FOLHA = `<svg viewBox="0 0 30 40" aria-hidden="true"><rect x=".5" y=".5" width="29" height="39" rx="2" fill="#fff"/><rect x="3" y="3" width="24" height="4" rx=".8" fill="#F2A900"/><path d="M3 11h24M3 15h24M3 19h16M3 25h24M3 29h24M3 33h18" stroke="#9AA3AF"/></svg>`;
  async function cancelada() {
    if (!ligado()) return;
    vibrar(30);
    const h = document.querySelector('#inicio .heroi');
    const r = h ? h.getBoundingClientRect() : { left: innerWidth / 2 - 40, top: 120, width: 80, height: 60 };
    if (h) h.classList.add('vai-lixo');
    solta('anim-lixeira', LIXEIRA, 1300);
    const fx = r.left + r.width / 2 - 22, fy = r.top + r.height / 2 - 30;
    const lr = { x: innerWidth / 2 - 22, y: innerHeight * 0.62 };
    const f = solta('anim-folha', `<div class="folha-y">${FOLHA}</div>`, 1300, `left:${fx}px;top:${fy}px`);
    f.style.setProperty('--dx', (lr.x - fx) + 'px');
    f.style.setProperty('--dy', (lr.y - fy) + 'px');
    setTimeout(() => vibrar(25), 700);
    await esperar(1000);
  }

  // Envio da FR pelo chefe / compartilhamento feito: avião de papel cruza a tela
  function enviada() {
    if (!ligado()) return;
    vibrar(12);
    solta('anim-aviao', '<svg viewBox="0 0 48 48"><path d="M4 22 44 6 34 42 22 30z" fill="#F4F4F0"/><path d="M22 30 44 6 16 26z" fill="#C9D1DB"/><path d="M22 30v12l6-7" fill="#AEB7C2"/></svg>', 1400);
  }

  // =====================================================================
  // Encerrar: placa PARE que gira e balança no poste, "ficha enviada · dia finalizado"
  // =====================================================================
  function pare({ km, paradas, un, enviada: foi = true } = {}) {
    if (!ligado()) return Promise.resolve();
    vibrar([30, 50, 30]);
    const cone = (lado, atraso) => `<span class="pr-cone pr-${lado}" style="animation-delay:${atraso}s"><svg viewBox="0 0 40 52" aria-hidden="true"><path d="M20 2 L33 44 H7 Z" fill="#FF6A13"/><path d="M14.5 21 H25.5 L27.6 28 H12.4 Z M11 33 H29 L30.6 38.5 H9.4 Z" fill="#F4F4F0"/><rect x="2" y="43" width="36" height="7" rx="2" fill="#E2560F"/></svg></span>`;
    const resumo = [km != null ? `${String(km).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${escapar(un || 'km')} rodados` : '',
      paradas ? `${paradas} ${paradas === 1 ? 'parada' : 'paradas'}` : ''].filter(Boolean).join(' · ');
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'anim-pare';
      el.innerHTML = `<div class="pr-luz"></div><div class="pr-poste"></div>
        <div class="pr-placa"><svg viewBox="0 0 200 200" aria-hidden="true">
          <polygon points="58,4 142,4 196,58 196,142 142,196 58,196 4,142 4,58" fill="#F4F4F0"/>
          <polygon points="62,13 138,13 187,62 187,138 138,187 62,187 13,138 13,62" fill="#D6262B"/>
          <text x="100" y="119" text-anchor="middle" font-size="50" font-weight="900" font-family="Archivo, sans-serif" fill="#F4F4F0" letter-spacing="1">PARE</text>
        </svg></div>
        ${cone('esq', 0.55)}${cone('dir', 0.65)}
        <div class="pr-texto">
          <b>${foi ? 'Ficha enviada' : 'Ficha salva'}<svg class="pr-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg></b>
          <span>Dia finalizado${resumo ? ' · ' + resumo : ''}</span>
          ${foi ? '' : '<small>Vai para o banco assim que tiver internet</small>'}
          <small>Bom descanso!</small>
        </div>
        <p class="anim-pular">Toque para continuar</p>`;
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
      let feito = false;
      const fim = () => {
        if (feito) return;
        feito = true;
        el.classList.add('saindo');
        setTimeout(() => { el.remove(); resolve(); }, 300);
      };
      el.addEventListener('click', fim);
      setTimeout(fim, 2900);
    });
  }

  // =====================================================================
  // Saída e chegada (depois que a tela inicial é redesenhada)
  // =====================================================================
  function saida() {
    if (!ligado()) return;
    vibrar(12);
    const ult = document.querySelector('#inicio .roteiro li:last-child');
    if (ult) ult.classList.add('parada-nova');
    const b = document.querySelector('#btnChegada');
    if (b) b.classList.add('troca');
  }
  function chegada() {
    if (!ligado()) return;
    vibrar([10, 40, 10]);
    const ult = document.querySelector('#inicio .roteiro li:last-child');
    if (ult) ult.classList.add('parada-chegou');
    const b = document.querySelector('#btnSaida');
    if (b) b.classList.add('troca');
  }

  // =====================================================================
  // Toque nos botões: cada tipo responde de um jeito
  // =====================================================================
  // Onda a partir do dedo (listas, chips, veículos, locais, cartões de ação)
  const COM_ONDA = '.np-local, .veiculo, .chip, .acao, .lista-marcar button, .opcao-marcar, .segmentos button, .btn-claro, .bloco, .frota-item, .fr-chefe';
  document.addEventListener('pointerdown', e => {
    if (!ligado()) return;
    const alvo = e.target.closest(COM_ONDA);
    if (!alvo || alvo.disabled) return;
    const r = alvo.getBoundingClientRect();
    const t = Math.max(r.width, r.height) * 2.2;
    const o = document.createElement('span');
    o.className = 'onda';
    o.style.cssText = `width:${t}px;height:${t}px;left:${e.clientX - r.left - t / 2}px;top:${e.clientY - r.top - t / 2}px`;
    if (getComputedStyle(alvo).position === 'static') alvo.style.position = 'relative';
    alvo.appendChild(o);
    setTimeout(() => o.remove(), 650);
  }, { passive: true });
  // Ao soltar: o botão faz o seu gesto (classe "tocou" por um instante)
  document.addEventListener('click', e => {
    if (!ligado()) return;
    const b = e.target.closest('.btn-principal, .bloco, .icone-btn, .item-btns button, .link, .btn-claro');
    if (!b) return;
    b.classList.remove('tocou');
    void b.offsetWidth; // reinicia a animação
    b.classList.add('tocou');
    setTimeout(() => b.classList.remove('tocou'), 700);
  });

  // Cartões e listas entram em cascata quando a tela aparece
  function entrar(tela) {
    if (!ligado()) return;
    const main = document.querySelector('#tela-' + tela + ' main');
    if (!main) return;
    Array.from(main.children).slice(0, 14).forEach((el, i) => {
      el.classList.remove('entra');
      void el.offsetWidth;
      el.style.setProperty('--i', i);
      el.classList.add('entra');
    });
  }

  global.FrAnim = { ligado, alternar, vibrar, pausa, digitos, rolar, cena, chegouNaPista, transicao, trocarTela, proxima, chaveIgnicao, ignicao, puxar, folhear, envio, cancelada, enviada, pare, saida, chegada, entrar };
})(window);
