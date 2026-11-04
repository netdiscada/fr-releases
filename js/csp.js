// FR - regra de segurança do navegador (CSP) na versão site: só roda código do próprio site e só conversa
// com o Firebase. Se algum dia um texto do banco trouxer código escondido, o navegador não executa.
// No APK não entra (o Capacitor injeta o próprio script e o app já roda isolado no celular).
(function () {
  if (window.Capacitor) return;
  const emulador = location.hostname === 'localhost' && location.port === '8090';
  const firebase = 'https://*.googleapis.com https://novo-cardapio-5b3a8.firebaseapp.com';
  const teste = emulador ? ' http://localhost:9098 http://localhost:8086 http://127.0.0.1:9098 http://127.0.0.1:8086' : '';
  const regras = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // www.google.com: imagem que o Firebase usa para testar se a internet voltou
    "img-src 'self' blob: data: https://www.google.com",
    "font-src 'self' blob: data:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${firebase}${teste}`,
    "frame-src https://novo-cardapio-5b3a8.firebaseapp.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = regras;
  document.head.prepend(meta);
})();
