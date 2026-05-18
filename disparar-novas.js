const axios = require('axios');
require('dotenv').config({ path: '/Users/nathan/agente-campanhas/.env' });

const BASE = 'https://api.z-api.io/instances/3F10E37B5CEF01ED9591F6C43064769D/token/4DD855B34BDBEB4358C198FB';
const HEADERS = { 'Client-Token': 'F23255dd67b1a4e4fb5b37a5c442b37b2S', 'Content-Type': 'application/json' };

function msg(contato, clinica, perfil, estrelas, avaliacoes) {
  return `${contato} Aqui é o Nathan, somos uma empresa parceira do Google.

Analisamos o perfil da ${clinica} e vimos que vocês oferecem ${perfil} — um trabalho de alto nível com ${estrelas} estrelas e ${avaliacoes} avaliações no Google!

Para perfis acima de 4 estrelas no Google liberamos uma consultoria gratuita com nossa equipe e gostaríamos de marcar uma visita com a proprietária para receber nossa equipe.

É uma consultoria gratuita com o objetivo de te mostrar como aumentar o número de pacientes pelo Google. Vamos mostrar algumas estratégias que podem te ajudar muito!

Podemos marcar? Qual horário fica melhor pra você?`;
}

const clinicas = [
  { fone: '5567999202682', nome: 'M.CO Consultórios', msg: msg('Oi, tudo bem!', 'M.CO Consultórios', 'harmonização facial, bioestimuladores, tratamentos anti-idade, criolipólise e tratamento de celulite', 4.9, 120) },
  { fone: '5567981765800', nome: 'Espaço Suzuki', msg: msg('Oi, tudo bem!', 'Espaço Suzuki', 'microagulhamento, ultrassom microfocado, laser Lavieen, criolipólise e depilação a laser', 4.8, 90) },
  { fone: '5567996353915', nome: 'Dra. Cristiane Comparin', msg: msg('Oi, Dra. Cristiane!', 'Clínica Dra. Cristiane Comparin', 'harmonização facial avançada em Campo Grande', 4.9, 75) },
  { fone: '5567992526509', nome: 'Clínica Valdilene Cabral', msg: msg('Oi, Valdilene!', 'Clínica Valdilene Cabral', 'harmonização facial e tratamentos estéticos avançados', 4.8, 60) },
  { fone: '5567992477884', nome: 'Ortoestética Campo Grande', msg: msg('Oi, tudo bem!', 'Ortoestética Campo Grande', 'harmonização facial, clareamento dental e estética avançada', 4.7, 25) },
  { fone: '5567992389566', nome: 'Bela Estética Caiçara', msg: msg('Oi, tudo bem!', 'Bela Estética', 'tratamentos estéticos faciais e corporais em Campo Grande', 4.8, 45) },
  { fone: '5567999898355', nome: 'M.CO Unidade 2', msg: msg('Oi, tudo bem!', 'M.CO Consultórios Chácara Cachoeira', 'estética avançada com harmonização facial, limpeza de pele e tratamentos corporais', 4.9, 80) },
  { fone: '5567930447748', nome: 'Espaço Suzuki Clínica da Dor', msg: msg('Oi, tudo bem!', 'Espaço Suzuki', 'tratamentos estéticos com tecnologias avançadas como HiPro e laser', 4.8, 90) },
  { fone: '5567932018000', nome: 'Magrass Centro', msg: msg('Oi, tudo bem!', 'Magrass Emagrecimento e Estética', 'emagrecimento, criolipólise e tratamentos corporais avançados', 4.7, 150) },
  { fone: '5567933828703', nome: 'Belíssima Centro Estética', msg: msg('Oi, tudo bem!', 'Belíssima Centro Estética', 'tratamentos estéticos faciais e corporais', 4.6, 55) },
  { fone: '5567934270355', nome: 'Clínica Flowe 2', msg: msg('Oi, tudo bem!', 'Body Shape Centro de Estética', 'modelagem corporal e tratamentos estéticos avançados', 4.5, 40) },
  { fone: '5567932126177', nome: 'Iasuda Estética', msg: msg('Oi, tudo bem!', 'Iasuda Estética Shiatsu e Reflexologia', 'shiatsu, reflexologia e tratamentos estéticos', 4.7, 35) },
  { fone: '5567933212909', nome: 'Personalite Estética', msg: msg('Oi, tudo bem!', 'Personalite Estética e Podologia', 'estética facial, corporal e podologia', 4.6, 30) },
  { fone: '5567933847274', nome: 'Clínica Luciana de Matos', msg: msg('Oi, Dra. Luciana!', 'Clínica Médica Luciana de Matos', 'tratamentos estéticos médicos avançados', 4.8, 65) },
  { fone: '5567933826366', nome: 'Bela Forma Estética', msg: msg('Oi, tudo bem!', 'Bela Forma Estética e Tratamento', 'estética e tratamento corporal em Campo Grande', 4.5, 28) },
];

async function main() {
  console.log(`Disparando para ${clinicas.length} clínicas novas...`);
  for (let i = 0; i < clinicas.length; i++) {
    const c = clinicas[i];
    try {
      await axios.post(`${BASE}/send-text`, { phone: c.fone, message: c.msg }, { headers: HEADERS });
      console.log(`✓ [${i+1}/${clinicas.length}] ${c.nome}`);
    } catch(e) {
      console.log(`✗ [${i+1}/${clinicas.length}] ${c.nome} — ${e.response?.data?.error || e.message}`);
    }
    if (i < clinicas.length - 1) await new Promise(r => setTimeout(r, 8000));
  }
  console.log('\nConcluído!');
}
main();
