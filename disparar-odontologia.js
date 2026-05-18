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

function msg(contato, nome, servicos) {
  return `${contato} Aqui é a Bia, somos uma empresa parceira do Google.

Analisamos o seu perfil no Google e vimos que você oferece ${servicos} — um trabalho de alto nível com ótimas avaliações!

Para perfis com boa avaliação no Google liberamos uma consultoria gratuita com nossa equipe e gostaríamos de marcar uma visita com você.

É uma consultoria gratuita com o objetivo de te mostrar como aumentar o número de pacientes pelo Google. Vamos mostrar algumas estratégias que podem te ajudar muito!

Podemos marcar? Qual horário fica melhor pra você?`;
}

// Foco em consultórios individuais — profissional que atende o próprio WhatsApp
const clinicas = [
  { fone: '5567992428948', nome: 'Dr. Kleber Sandim',       msg: msg('Oi, Dr. Kleber!',   'Dr. Kleber Sandim',    'atendimento 24h, implantes, clareamento e estética dental') },
  { fone: '5567991219812', nome: 'Dr. Lucas Figueiredo',    msg: msg('Oi, Dr. Lucas!',    'Dr. Lucas Figueiredo', 'odontologia completa, implantes e aparelho ortodôntico') },
  { fone: '5567984673592', nome: 'Dra. Janaína Castello',   msg: msg('Oi, Dra. Janaína!', 'Dra. Janaína Castello','lâminas cerâmicas, próteses e estética dental avançada') },
  { fone: '5567996464441', nome: 'Dra. Aline Camargo',      msg: msg('Oi, Dra. Aline!',   'Dra. Aline Camargo',   'odontologia estética, implantes e harmonização facial') },
  { fone: '5567991708667', nome: 'Consultório Caiobá',      msg: msg('Oi, tudo bem!',     'Consultório Odontológico Caiobá', 'odontologia geral e especializada em Campo Grande') },
  { fone: '5567992457928', nome: 'Dr. Marco Polo Siebra',   msg: msg('Oi, Dr. Marco!',    'Dr. Marco Polo Siebra','odontologia especializada com mais de 32 anos de experiência') },
  { fone: '5567993445530', nome: 'Dr. Arthur Azambuja',     msg: msg('Oi, Dr. Arthur!',   'Dr. Arthur Azambuja',  'cirurgia buco-maxilo-facial, implantes e harmonização orofacial') },
  { fone: '5567998341261', nome: 'Dra. Beatriz Ozório',     msg: msg('Oi, Dra. Beatriz!', 'Dra. Beatriz Ozório',  'odontologia de qualidade e atendimento humanizado') },
  { fone: '5567992477884', nome: 'Dra. Caroline Senna',     msg: msg('Oi, Dra. Caroline!','Dra. Caroline Senna',  'ortodontia e estética dental em Campo Grande') },
  { fone: '5567981011604', nome: 'Dr. Claudio Santana',     msg: msg('Oi, Dr. Claudio!',  'Dr. Claudio Santana',  'odontologia geral e tratamentos estéticos dentais') },
];

async function main() {
  const jaDisparados = lerDisparados();
  const lista = clinicas.filter(c => {
    const foneNum = c.fone.replace(/\D/g, '').replace(/^55/, '');
    return !jaDisparados.includes(foneNum);
  });

  console.log(`Total na lista: ${clinicas.length} | Já enviados: ${clinicas.length - lista.length} | A enviar: ${lista.length}`);
  console.log(`Intervalo: ${INTERVALO / 1000}s entre mensagens\n`);

  if (lista.length === 0) {
    console.log('Todos já receberam disparo!');
    return;
  }

  let ok = 0, err = 0;

  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    try {
      await axios.post(`${BASE}/send-text`, { phone: c.fone, message: c.msg }, { headers: HEADERS });
      registrarDisparado(c.fone);
      console.log(`✓ [${i + 1}/${lista.length}] ${c.nome}`);
      ok++;
    } catch (e) {
      console.log(`✗ [${i + 1}/${lista.length}] ${c.nome} — ${e.response?.data?.error || e.message}`);
      err++;
    }
    if (i < lista.length - 1) await new Promise(r => setTimeout(r, INTERVALO));
  }

  console.log(`\nConcluído! ✓ ${ok} enviados | ✗ ${err} erros`);
}

main();
