const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '/Users/nathan/agente-campanhas/.env' });

const BASE = 'https://api.z-api.io/instances/3F10E37B5CEF01ED9591F6C43064769D/token/4DD855B34BDBEB4358C198FB';
const HEADERS = { 'Client-Token': 'F23255dd67b1a4e4fb5b37a5c442b37b2S', 'Content-Type': 'application/json' };
const INTERVALO = 45000; // 45 segundos entre mensagens

const DISPARADOS_FILE = path.join(__dirname, 'data/disparados.json');

function lerDisparados() {
  try {
    if (fs.existsSync(DISPARADOS_FILE)) return JSON.parse(fs.readFileSync(DISPARADOS_FILE, 'utf8'));
  } catch {}
  return [];
}

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

const variacoes = [
  (empresa) => `Oi, tudo bem! Aqui é a Bia, somos uma empresa parceira do Google.

Analisamos o perfil da ${empresa} e vimos que vocês oferecem serviços gráficos de qualidade em Campo Grande!

Para perfis com boa avaliação no Google liberamos uma consultoria gratuita com nossa equipe e gostaríamos de marcar uma visita com o responsável.

É uma consultoria gratuita com o objetivo de te mostrar como aumentar o número de clientes pelo Google. Vamos mostrar algumas estratégias que podem te ajudar muito!

Podemos marcar? Qual horário fica melhor pra você?`,
];

// Rodada 3 — novos números confirmados
const graficas = [
  { fone: '5567999825074', nome: 'Gráfica Maxxi Print' },
  { fone: '5567999005557', nome: 'Conservare Gráfica' },
  { fone: '5567996003283', nome: 'PaulGráfica Editora' },
  { fone: '5567991256868', nome: 'Nova Print Soluções Gráficas' },
  { fone: '5567991983977', nome: 'GrafiQx Impressão Digital' },
  { fone: '5567991385276', nome: 'Alan Roger Adesivos e Comunicação Visual' },
  { fone: '5567992205261', nome: 'Art Tec Comunicação Visual' },
  { fone: '5567999091226', nome: 'Gráfica Capital' },
  { fone: '5567996047771', nome: 'Cópias Look Gráfica Rápida' },
  { fone: '5567991426771', nome: 'Copy Art Adesivos e Gráfica' },
  { fone: '5567992620380', nome: 'Graficolor' },
  { fone: '5567999129980', nome: 'Gráfica Pontual' },
  { fone: '5567991797873', nome: 'MV Impressões' },
];

async function main() {
  const jaDisparados = lerDisparados();
  const lista = graficas.filter(g => {
    const foneNum = g.fone.replace(/\D/g, '').replace(/^55/, '');
    return !jaDisparados.includes(foneNum);
  });

  console.log(`Total na lista: ${graficas.length} | Já enviados: ${graficas.length - lista.length} | A enviar: ${lista.length}`);
  console.log(`Intervalo: ${INTERVALO / 1000}s entre mensagens\n`);

  if (lista.length === 0) {
    console.log('Todos já receberam disparo!');
    return;
  }

  let ok = 0, err = 0;

  for (let i = 0; i < lista.length; i++) {
    const g = lista[i];
    const mensagem = variacoes[i % variacoes.length](g.nome);
    try {
      await axios.post(`${BASE}/send-text`, { phone: g.fone, message: mensagem }, { headers: HEADERS });
      registrarDisparado(g.fone);
      console.log(`✓ [${i + 1}/${lista.length}] ${g.nome}`);
      ok++;
    } catch (e) {
      console.log(`✗ [${i + 1}/${lista.length}] ${g.nome} — ${e.response?.data?.error || e.message}`);
      err++;
    }
    if (i < lista.length - 1) await new Promise(r => setTimeout(r, INTERVALO));
  }

  console.log(`\nConcluído! ✓ ${ok} enviados | ✗ ${err} erros`);
}

main();
