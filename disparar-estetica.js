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

function msg(contato, clinica, perfil, estrelas, avaliacoes) {
  return `${contato} Aqui é a Bia, somos uma empresa parceira do Google.

Analisamos o perfil da ${clinica} e vimos que vocês oferecem ${perfil} — um trabalho de alto nível com ${estrelas} estrelas e ${avaliacoes} avaliações no Google!

Para perfis acima de 4 estrelas no Google liberamos uma consultoria gratuita com nossa equipe e gostaríamos de marcar uma visita com a proprietária para receber nossa equipe.

É uma consultoria gratuita com o objetivo de te mostrar como aumentar o número de clientes pelo Google. Vamos mostrar algumas estratégias que podem te ajudar muito!

Podemos marcar? Qual horário fica melhor pra você?`;
}

const clinicas = [
  { fone: '5567996516665', nome: 'Dra. Camila Pitton', msg: msg('Oi, Dra. Camila!', 'Micropigmentação e Estética Dra Camila Pitton', 'micropigmentação e estética avançada', 5, 18) },
  { fone: '5567993121884', nome: 'Hof Clinic', msg: msg('Oi, tudo bem!', 'Hof Clinic Campo Grande', 'tratamentos estéticos avançados', 4.4, 80) },
  { fone: '5567998405835', nome: 'Clínica MagraSS', msg: msg('Oi, tudo bem!', 'Clínica MagraSS', 'emagrecimento, criolipólise, tratamento de gordura localizada, estria, flacidez e celulite', 4.8, 470) },
  { fone: '5567998203459', nome: 'Karina Bertonha', msg: msg('Oi, Karina!', 'Karina Bertonha Esteticista', 'estética facial e corporal com foco em resultados naturais', 5, 63) },
  { fone: '5567998521797', nome: 'Clínica Refine', msg: msg('Oi, tudo bem!', 'Clínica Refine', 'botox, bioestimulador, harmonização facial, fios, lipo sem corte e emagrecimento', 5, 25) },
  { fone: '5567993240504', nome: 'Esteticista Allana Perroni', msg: msg('Oi, Allana!', 'Allana Perroni Estética', 'estética facial e corporal personalizada', 5, 51) },
  { fone: '5567982240931', nome: 'Royal Salutti', msg: msg('Oi, tudo bem!', 'Royal Salutti', 'estética avançada facial e corporal', 4.8, 41) },
  { fone: '5567992093964', nome: 'Clínica Ousee', msg: msg('Oi, tudo bem!', 'Clínica Ousee', 'estética facial e corporal em Campo Grande', 5, 7) },
  { fone: '5567991926127', nome: 'LaserStar Spa', msg: msg('Oi, tudo bem!', 'LaserStar Spa Urbano e Estética', 'spa urbano e estética avançada', 5, 222) },
  { fone: '5567984599693', nome: 'Bela Estética', msg: msg('Oi, tudo bem!', 'Bela Estética e Bem Estar', 'estética e bem estar com atendimento diferenciado', 5, 173) },
  { fone: '5567992045187', nome: 'Men Spa', msg: msg('Oi, tudo bem!', 'Men Spa e Estética', 'estética especializada para homens e mulheres', 4.9, 114) },
  { fone: '5567981119226', nome: 'Shizen Beleza', msg: msg('Oi, tudo bem!', 'Shizen Beauty Center', 'massagem, estética, shiatsu, reiki e spa', 4.8, 115) },
  { fone: '5567999693862', nome: 'Instituto Samara Nocchi', msg: msg('Oi, Samara!', 'Instituto Samara Nocchi Estética Avançada', 'estética avançada com foco em resultados', 5, 68) },
  { fone: '5567998774675', nome: 'Spa Express', msg: msg('Oi, tudo bem!', 'Spa Express', 'spa em domicílio em Campo Grande', 5, 16) },
  { fone: '5567984729282', nome: 'Esteticista Shara Leão', msg: msg('Oi, Shara!', 'Shara Leão Estética', 'estética facial e corporal, designer de sobrancelha e depilação', 5, 20) },
  { fone: '5567996461332', nome: 'Esteticista Mariana Mazeto', msg: msg('Oi, Mariana!', 'Mariana Mazeto Estética', 'estética facial e corporal personalizada', 5, 33) },
  { fone: '5567991008455', nome: 'Studio Bela Face', msg: msg('Oi, tudo bem!', 'Studio Bela Face', 'estética avançada facial e corporal', 5, 43) },
  { fone: '5567992827283', nome: 'Gründler SPA', msg: msg('Oi, tudo bem!', 'Gründler SPA', 'spa e estética avançada', 5, 45) },
  { fone: '5567992704403', nome: 'Renata Cassani', msg: msg('Oi, Renata!', 'Massagem Spa CG Renata Cassani', 'massagem terapêutica e estética', 4.8, 53) },
  { fone: '5567999072220', nome: 'Clínica Batistelly', msg: msg('Oi, Dra. Bianca!', 'Clínica Batistelly Estética e Beleza', 'estética avançada com foco em resultados naturais', 5, 36) },
  { fone: '5567996752859', nome: 'Aline Gil', msg: msg('Oi, Aline!', 'Aline Gil Estética Especializada', 'estética especializada facial e corporal', 5, 66) },
  { fone: '5567991206703', nome: 'Clínica Vieira Estética', msg: msg('Oi, tudo bem!', 'Clínica Vieira Estética Avançada', 'estética avançada em Campo Grande', 5, 55) },
  { fone: '5567992325949', nome: 'Clínica VMCG', msg: msg('Oi, tudo bem!', 'Clínica VMCG', 'harmonização e estética avançada', 4.8, 67) },
  { fone: '5567933615074', nome: 'Estética Corpo & Pele', msg: msg('Oi, tudo bem!', 'Estética Corpo e Pele', 'estética facial e corporal completa', 4.9, 82) },
  { fone: '5567974008588', nome: 'Dra. Jennifer Pereira', msg: msg('Oi, Dra. Jennifer!', 'Dra. Jennifer Pereira', 'harmonização facial e estética avançada', 5, 64) },
  { fone: '5567996141516', nome: 'Dra. Daniele Dundi', msg: msg('Oi, Dra. Daniele!', 'Harmonização Facial Dra. Daniele Dundi', 'harmonização facial avançada', 5, 22) },
  { fone: '5567998914688', nome: 'Dra. Amanda Tinajero', msg: msg('Oi, Dra. Amanda!', 'Dra. Amanda Tinajero', 'harmonização orofacial avançada', 5, 26) },
  { fone: '5567996329662', nome: 'Dra. Karolyne Alves', msg: msg('Oi, Dra. Karolyne!', 'CliniKa Dra. Karolyne Alves', 'harmonização facial e corporal avançada', 5, 19) },
  { fone: '5567992045164', nome: 'Dra. Isabella Ventura', msg: msg('Oi, Dra. Isabella!', 'Dra. Isabella Ventura', 'harmonização facial avançada', 5, 15) },
  { fone: '5567999386721', nome: 'Harmoface', msg: msg('Oi, tudo bem!', 'Harmoface', 'harmonização facial e botox', 5, 71) },
  { fone: '5567999693303', nome: 'Dra. Sabrina Mestre', msg: msg('Oi, Dra. Sabrina!', 'Dra. Sabrina Mestre', 'harmonização facial avançada', 4.9, 29) },
  { fone: '5567999537575', nome: 'Dra. Giovanna Barbosa', msg: msg('Oi, Dra. Giovanna!', 'Dra. Giovanna Barbosa', 'lipoaspiração de papada e harmonização facial', 5, 23) },
  { fone: '5567991125336', nome: 'Dra. Jéssica Monteiro', msg: msg('Oi, Dra. Jéssica!', 'Dra Jéssica Monteiro', 'harmonização orofacial avançada', 5, 15) },
  { fone: '5567999595574', nome: 'Dra. Lídia Machado', msg: msg('Oi, Dra. Lídia!', 'Clínica Dra. Lídia Machado', 'estética avançada e harmonização', 5, 13) },
  { fone: '5567996242187', nome: 'Adriana Quevedo', msg: msg('Oi, Adriana!', 'Adriana Quevedo Harmonização Orofacial', 'harmonização orofacial avançada', 5, 8) },
  { fone: '5567992576526', nome: 'Dra. Tamiris Zani', msg: msg('Oi, Dra. Tamiris!', 'Dra. Tamiris Zani', 'harmonização facial e corporal', 5, 6) },
  { fone: '5567999292493', nome: 'For You Clinic', msg: msg('Oi, Dra. Jéssica!', 'For You Clinic Dra Jéssica Ferreira', 'estética avançada e harmonização facial', 5, 189) },
  { fone: '5567991384845', nome: 'Dra. Andressa Mauro', msg: msg('Oi, Dra. Andressa!', 'Clínica Dra. Andressa Mauro', 'estética avançada e harmonização', 5, 12) },
  { fone: '5567996144071', nome: 'Dra. Mara Okumura', msg: msg('Oi, Dra. Mara!', 'Clínica de Estética Dra Mara Okumura', 'estética avançada em Campo Grande', 5, 11) },
  { fone: '5567996012262', nome: 'Dra. Camila Candido', msg: msg('Oi, Dra. Camila!', 'Dra. Camila Candido', 'harmonização facial, estética avançada e dermatofuncional', 5, 19) },
  { fone: '5567999770520', nome: 'Estetik KV', msg: msg('Oi, tudo bem!', 'Estetik KV Shopping Campo Grande', 'estética e depilação a laser', 5, 21) },
  { fone: '5567998813028', nome: 'BOTOCLINIC', msg: msg('Oi, tudo bem!', 'BOTOCLINIC Campo Grande', 'botox e harmonização facial acessível', 4.7, 85) },
  { fone: '5567992950546', nome: 'Clínica Corpo & Pele', msg: msg('Oi, tudo bem!', 'Clínica Corpo & Pele', 'harmonização facial e rejuvenescimento avançado', 5, 30) },
  { fone: '5567998249466', nome: 'Skin Care Clínica de Estética', msg: msg('Oi, tudo bem!', 'Skin Care Clínica de Estética', 'estética facial e corporal com tecnologia avançada', 5, 40) },
  { fone: '5567992946454', nome: 'Emporium da Beleza', msg: msg('Oi, tudo bem!', 'Emporium da Beleza', 'harmonização facial, emagrecimento e laser', 5, 35) },
  { fone: '5567998228539', nome: 'Franciele Santos Müller', msg: msg('Oi, Franciele!', 'Franciele Santos Müller Esteticista', 'estética e cosmetologia especializada', 5, 20) },
  { fone: '5567992538833', nome: 'Clínica Ícaro Moreira', msg: msg('Oi, tudo bem!', 'Clínica Ícaro Moreira', 'harmonização facial, bioestimuladores e micropigmentação', 5, 45) },
  { fone: '5567992867744', nome: 'Royal Face', msg: msg('Oi, tudo bem!', 'Royal Face Campo Grande', 'botox, preenchimento e harmonização facial avançada', 4.9, 120) },
  { fone: '5567999469460', nome: 'Paullini Franceschini', msg: msg('Oi, Paullini!', 'Paullini Franceschini Esteticista', 'estética avançada em Campo Grande', 5, 25) },
  { fone: '5567996353915', nome: 'Dra. Cristiane Comparin', msg: msg('Oi, Dra. Cristiane!', 'Dra. Cristiane Comparin', 'harmonização facial e dermatologia avançada', 5, 50) },
  { fone: '5567999826010', nome: 'Clínica Spazzio', msg: msg('Oi, tudo bem!', 'Clínica Spazzio', 'estética avançada em Campo Grande', 4.9, 35) },
  { fone: '5567996077434', nome: 'Dra. Lidiane Costa', msg: msg('Oi, Dra. Lidiane!', 'Clínica Dra. Lidiane Costa', 'dermatologia e harmonização facial avançada', 5, 60) },
  { fone: '5567982015301', nome: 'Nelise Roza Spa', msg: msg('Oi, tudo bem!', 'Spa Nelise Roza', 'spa, estética avançada e tratamentos corporais', 4.8, 90) },
  { fone: '5567992107797', nome: 'Magnific Clínica', msg: msg('Oi, tudo bem!', 'Magnific Clínica de Estética', 'estética facial e corporal com mais de 13 anos de tradição', 4.8, 75) },
  { fone: '5567996252972', nome: 'Sutil Estética', msg: msg('Oi, tudo bem!', 'Sutil Estética', 'estética e beleza no Centro de Campo Grande', 4.9, 30) },
  { fone: '5567996201623', nome: 'Além do Olhar', msg: msg('Oi, tudo bem!', 'Além do Olhar', 'estética avançada e cuidados especializados com os olhos', 5, 40) },
  { fone: '5567998550468', nome: 'AURA Beleza Spa', msg: msg('Oi, tudo bem!', 'AURA Beleza Spa', 'spa, massagem estética, depilação e cuidados corporais', 4.9, 45) },
  { fone: '5567981736514', nome: 'Derma Fysio', msg: msg('Oi, tudo bem!', 'Derma Fysio', 'fisioterapia estética com tecnologias avançadas faciais e corporais', 5, 30) },
  { fone: '5567999246211', nome: 'Clínica Innova MS', msg: msg('Oi, tudo bem!', 'Clínica Innova MS', 'estética e harmonização avançada em Campo Grande', 5, 35) },
  { fone: '5567992526509', nome: 'Clínica Valdilene Cabral', msg: msg('Oi, tudo bem!', 'Clínica Valdilene Cabral', 'harmonização facial avançada com procedimentos personalizados', 5, 40) },
  { fone: '5567999202682', nome: 'M.CO Consultórios', msg: msg('Oi, tudo bem!', 'M.CO Consultórios', 'estética avançada com laser, ultraformer e tratamentos de alta tecnologia', 4.9, 80) },
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
    console.log('Todas já receberam disparo!');
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
