// FR - configuração do Firebase (projeto "FR SMSUZ", plano Spark gratuito).
// Estes valores não são segredo: quem protege os dados são as regras do firestore.rules.
// Aberto pelo servidor de teste do computador (localhost:8090), o app usa os emuladores
// do Firebase em vez do banco real.
window.FR_CONFIG = {
  EMULADOR: location.hostname === 'localhost' && location.port === '8090',
  EMULADOR_HOST: 'localhost',
  firebase: {
    apiKey: 'AIzaSyDmopLFr5GMLkYHOV407O6OnNbCNwEHp4M',
    authDomain: 'novo-cardapio-5b3a8.firebaseapp.com',
    projectId: 'novo-cardapio-5b3a8',
    storageBucket: 'novo-cardapio-5b3a8.firebasestorage.app',
    messagingSenderId: '824824021105',
    appId: '1:824824021105:web:0f79876202c666c90a5bd0',
  },
};
// Os emuladores rodam como o projeto de teste "demo-fr"
if (window.FR_CONFIG.EMULADOR) {
  window.FR_CONFIG.firebase = { apiKey: 'demo-fr', projectId: 'demo-fr', authDomain: 'demo-fr.firebaseapp.com' };
}
