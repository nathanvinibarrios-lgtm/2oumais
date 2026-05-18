const axios = require('axios');
const mensagens = require('./mensagens-geradas.json');

const BASE = 'https://api.z-api.io/instances/3F10E37B5CEF01ED9591F6C43064769D/token/4DD855B34BDBEB4358C198FB';
const HEADERS = { 'Client-Token': 'F23255dd67b1a4e4fb5b37a5c442b37b2S', 'Content-Type': 'application/json' };
const INTERVALO = 8000;

async function enviar(fone, mensagem, nome) {
  try {
    const r = await axios.post(`${BASE}/send-text`, { phone: fone, message: mensagem }, { headers: HEADERS });
    console.log(`✓ Enviado: ${nome}`);
    return true;
  } catch (e) {
    console.log(`✗ Erro: ${nome} — ${e.response?.data?.error || e.message}`);
    return false;
  }
}

async function main() {
  let ok = 0, err = 0;
  for (const m of mensagens) {
    await enviar(m.fone, m.mensagem, m.nome);
    ok++;
    if (mensagens.indexOf(m) < mensagens.length - 1) {
      await new Promise(r => setTimeout(r, INTERVALO));
    }
  }
  console.log(`\nConcluído: ${ok} enviados`);
}
main();
