// FR - notificações no celular (push do Firebase Cloud Messaging). Só no APK; no site não faz nada.
// O aparelho pede permissão, pega o token do FCM e grava em deviceTokens/ (o Worker de notificações lê de lá):
//  - funcionário ou chefe: pela sessão do RGF (role 'funcionario' ou 'chefe');
//  - ADM: pela sessão do ADM (role 'adm', registro próprio). O mesmo celular pode ser os dois.
// O que chega: pedidos de acesso/troca de RGF (ADM), lembrete 15h30 de encerrar a FR (funcionário)
// e de imprimir as FRs (chefe e ADM). Ver push-worker/worker.js.
(function (global) {
  'use strict';
  const F = global.FR, Db = global.FrDb;
  const CANAL = 'fr_avisos';
  const plugin = () => F.plugin('PushNotifications');

  let token = null, preparando = null, ouvindo = false;
  let aguardando = null; // resolve quem espera o token chegar

  function ligarOuvintes(P) {
    if (ouvindo) return;
    ouvindo = true;
    P.addListener('registration', t => {
      token = t.value;
      if (aguardando) { aguardando(token); aguardando = null; }
      else registrar().then(registrarAdm).catch(() => {}); // o Firebase trocou o token: grava o novo
    });
    P.addListener('registrationError', e => {
      console.warn('[push] registro', e && e.error || e);
      if (aguardando) { aguardando(null); aguardando = null; }
    });
    // Com o app aberto o Android não mostra a notificação sozinho: avisa na tela
    P.addListener('pushNotificationReceived', n => { if (n && n.title) F.avisar(n.body ? `${n.title}: ${n.body}` : n.title); });
    // Tocou na notificação
    P.addListener('pushNotificationActionPerformed', a => abrirPara(a && a.notification && a.notification.data && a.notification.data.acao));
  }

  // Pede permissão (Android 13+), cria o canal e devolve o token do FCM (ou null se negado/sem Google Play)
  function pegarToken() {
    if (token) return Promise.resolve(token);
    if (preparando) return preparando;
    const P = plugin();
    if (!P) return Promise.resolve(null);
    preparando = (async () => {
      try {
        ligarOuvintes(P);
        let perm = await P.checkPermissions();
        if (perm.receive !== 'granted') perm = await P.requestPermissions();
        if (perm.receive !== 'granted') return null;
        try { await P.createChannel({ id: CANAL, name: 'Avisos do FR', description: 'Pedidos de acesso, lembretes de encerrar e de imprimir', importance: 4, visibility: 1 }); } catch (e) { /* já existe */ }
        return await new Promise(resolve => {
          aguardando = resolve;
          setTimeout(() => { if (aguardando === resolve) { aguardando = null; resolve(null); } }, 20000);
          P.register().catch(() => { if (aguardando === resolve) { aguardando = null; resolve(null); } });
        });
      } catch (e) {
        console.warn('[push] token', e && e.message || e);
        return null;
      } finally { preparando = null; }
    })();
    return preparando;
  }

  // Funcionário ou chefe deste celular (sessão do RGF)
  async function registrar() {
    const p = F.perfil();
    if (!p || !p.rgf) return;
    const t = await pegarToken();
    if (!t) return;
    const role = p.papel === 'chefe' ? 'chefe' : 'funcionario';
    try { await Db.registrarAparelho(t, { rgf: p.rgf, role }); }
    catch (e) {
      // Perfil diz chefe mas o banco não confirma (papel tirado pelo ADM): vale como funcionário
      if (role === 'chefe') await Db.registrarAparelho(t, { rgf: p.rgf, role: 'funcionario' }).catch(() => {});
      else console.warn('[push] registrar', e.code || e);
    }
  }

  // ADM logado neste celular (sessão do ADM)
  async function registrarAdm() {
    if (!plugin() || !(await Db.souAdm())) return;
    const t = await pegarToken();
    if (!t) return;
    await Db.registrarAparelhoAdm(t, true).catch(e => console.warn('[push] registrar ADM', e.code || e));
  }

  // Antes de sair do ADM (depois não há mais permissão para gravar): este celular deixa de receber os avisos do ADM
  async function desativarAdm() {
    // O app pode ter sido reaberto sem carregar o token ainda: busca, mas sem segurar a saída por mais de 3 s
    const t = token || await Promise.race([pegarToken(), new Promise(r => setTimeout(() => r(null), 3000))]);
    if (!t) return;
    await Db.registrarAparelhoAdm(t, false).catch(e => console.warn('[push] desativar ADM', e.code || e));
  }

  // Ao tocar na notificação: pedido de acesso/troca leva para a aba Equipe do ADM (se este celular é ADM)
  async function abrirPara(acao) {
    try {
      if (acao !== 'acessos') return;
      if (F.estado.modoAdm) global.FrAdm.irPara('funcionarios');
      else if (await Db.souAdm()) { global.FrAdm.entrar(); global.FrAdm.irPara('funcionarios'); }
    } catch (e) { console.warn('[push] abrir', e && e.message || e); }
  }

  // Na abertura do app: depois que a primeira tela já apareceu, para não atrasar nem sobrepor a pergunta de permissão
  function iniciar() {
    if (!plugin()) return;
    setTimeout(() => { registrar().then(registrarAdm).catch(e => console.warn('[push] iniciar', e && e.message || e)); }, 4000);
  }

  global.FrPush = { iniciar, registrar, registrarAdm, desativarAdm };
})(window);
