const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/Users/nathan/agente-campanhas/.env' });

const BASE = 'https://api.z-api.io/instances/3F10E37B5CEF01ED9591F6C43064769D/token/4DD855B34BDBEB4358C198FB';
const HEADERS = { 'Client-Token': 'F23255dd67b1a4e4fb5b37a5c442b37b2S', 'Content-Type': 'application/json' };
const INTERVALO = 20000; // 20 segundos entre mensagens

const DISPARADOS_FILE = path.join(__dirname, 'data/disparados.json');

function registrarDisparado(fone) {
  let lista = [];
  try {
    if (fs.existsSync(DISPARADOS_FILE)) lista = JSON.parse(fs.readFileSync(DISPARADOS_FILE, 'utf8'));
  } catch {}
  const foneNum = fone.replace(/\D/g, '').replace(/^55/, '');
  if (!lista.includes(foneNum)) {
    lista.push(foneNum);
    fs.mkdirSync(path.dirname(DISPARADOS_FILE), { recursive: true });
    fs.writeFileSync(DISPARADOS_FILE, JSON.stringify(lista, null, 2));
  }
}

function msg(empresa) {
  return `Oi, tudo bem! Aqui é a Bia, somos uma empresa parceira do Google.

Analisamos o perfil da ${empresa} no Google e vimos que vocês oferecem serviços de desentupimento aqui em Campo Grande!

Para perfis com boa avaliação no Google liberamos uma consultoria gratuita com nossa equipe e gostaríamos de marcar uma visita com o responsável.

É uma consultoria gratuita com o objetivo de te mostrar como aumentar o número de clientes pelo Google. Vamos mostrar algumas estratégias que podem te ajudar muito!

Podemos marcar? Qual horário fica melhor pra você?`;
}

const empresas = [
  { fone: '5567999303951', nome: 'Desentupidora MS' },
  { fone: '5567992236446', nome: 'AM Desentupidora Pantanal' },
  { fone: '5567991304223', nome: 'Desentupidora Campo Grande' },
  { fone: '5567992826660', nome: 'ANR Desentupidora' },
  { fone: '5567992805595', nome: 'Desentupidora Campo Grande MS' },
  { fone: '5567991352600', nome: 'Limpa Fossa Tatuzão' },
  { fone: '5567996171003', nome: 'Desentop Já' },
  { fone: '5567993291910', nome: 'Desentupidora Libanês' },
  { fone: '5567999513555', nome: 'Tec Clean Desentupidora' },
];

async function main() {
  console.log(`Disparando para ${empresas.length} desentupidoras em Campo Grande MS...`);
  console.log(`Intervalo: ${INTERVALO / 1000}s entre mensagens\n`);

  let ok = 0, err = 0;

  for (let i = 0; i < empresas.length; i++) {
    const e = empresas[i];
    try {
      await axios.post(`${BASE}/send-text`, { phone: e.fone, message: msg(e.nome) }, { headers: HEADERS });
      registrarDisparado(e.fone);
      console.log(`✓ [${i + 1}/${empresas.length}] ${e.nome}`);
      ok++;
    } catch (err2) {
      console.log(`✗ [${i + 1}/${empresas.length}] ${e.nome} — ${err2.response?.data?.error || err2.message}`);
      err++;
    }
    if (i < empresas.length - 1) await new Promise(r => setTimeout(r, INTERVALO));
  }

  console.log(`\nConcluído! ✓ ${ok} enviados | ✗ ${err} erros`);
}

main();
