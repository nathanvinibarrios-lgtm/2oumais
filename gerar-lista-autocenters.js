const XLSX = require('xlsx');
const path = require('path');

const lista = [
  { nome: 'Auto Center Norte Sul', telefone: '5567320196140', endereco: 'Bairro Amambaí, Campo Grande MS', servicos: 'Mecânica, funilaria, pintura, revisão' },
  { nome: 'Autocenter Dias', telefone: '5567984889424', endereco: 'Av. Eduardo Elias Zahran, 1980 — Vila Vilas Boas', servicos: 'Mecânica geral, alinhamento, balanceamento' },
  { nome: 'Corrêa Auto Center', telefone: '5567981460587', endereco: 'Av. Júlio de Castilho, 5079 — Vila Sílvia Regina', servicos: 'Mecânica, suspensão, freios, injeção eletrônica' },
  { nome: 'D3 Centro Automotivo', telefone: '5567334622830', endereco: 'Av. das Bandeiras, 3143 — Vila Piratininga', servicos: 'Mecânica automotiva completa' },
  { nome: 'Campo Grande Centro Automotivo', telefone: '5567336376590', endereco: 'R. dos Guaranis, 348 — Jardim Petrópolis', servicos: 'Centro automotivo completo' },
  { nome: 'Mecânica Auto Grande', telefone: '5567302771100', endereco: 'R. Pedro Celestino, 479 — Centro', servicos: 'Mecânica geral' },
  { nome: 'Sid Car Auto Center', telefone: '5567333103340', endereco: 'Av. Tiradentes, 1.451 — Vila Taveiropolis', servicos: 'Auto center completo' },
  { nome: 'Box 1 Automotivo', telefone: '5567320186510', endereco: 'R. Dr. Dolor Ferreira de Andrade, 2658 — Cel. Antonino', servicos: 'Mecânica, elétrica, diagnóstico' },
  { nome: 'Bosch Car Service', telefone: '5567338680800', endereco: 'R. Clineu da Costa Morães, 397 — Jardim Leblon', servicos: 'Revisão, diagnóstico, mecânica Bosch' },
  { nome: 'Multcar Centro Automotivo', telefone: '5567338218270', endereco: 'R. Arnaldo Serra, 351 — Vila Carvalho', servicos: 'Centro automotivo multimarcas' },
  { nome: 'Eletrocar Auto Center', telefone: '5567991464002', endereco: 'Vila Sílvia Regina, Campo Grande MS', servicos: 'Auto elétrica e mecânica' },
  { nome: 'Auto Center 2 Irmãos', telefone: '5567992004218', endereco: 'Conjunto Aero Rancho, Campo Grande MS', servicos: 'Mecânica geral e elétrica' },
  { nome: 'Paulo Auto Center', telefone: '5567991051326', endereco: 'Vila Santo Eugênio, Campo Grande MS', servicos: 'Mecânica, suspensão, freios' },
  { nome: 'Niwa Car Center', telefone: '5567332474720', endereco: 'Campo Grande MS', servicos: 'Centro automotivo' },
  { nome: 'Intermomm Centro Automotivo', telefone: '5567334174660', endereco: 'R. Rio de Janeiro, 1293 — Cel. Antonino', servicos: 'Mecânica, polimento, estética automotiva' },
  { nome: 'Jair Centro Automotivo 9000', telefone: '5567302712440', endereco: 'Av. Eduardo Elias Zahran, 3045 — Vila Antônio Vendas', servicos: 'Centro automotivo completo' },
  { nome: 'Mecânica Santana', telefone: '5567335175560', endereco: 'R. Navirai — Vila Margarida', servicos: 'Mecânica geral' },
  { nome: 'Versailles Center Car', telefone: '5567334231070', endereco: 'R. Geraldo Agostinho Ramos, 252 — Jardim Paulista', servicos: 'Auto center completo' },
  { nome: 'Mega Pneus', telefone: '5567338010590', endereco: 'Av. Marechal Deodoro, 6027 — Jardim Centenário', servicos: 'Pneus, alinhamento, balanceamento' },
  { nome: 'Auto Mecânica Almeida', telefone: '5567999639678', endereco: 'R. Miguel Couto, 222 — Vila Carvalho', servicos: 'Mecânica geral e elétrica' },
  { nome: 'Hot Wheels Acessórios', telefone: '5567338299884', endereco: 'Av. Ricardo Brandão, 2273 — Vila Manoel Costa Lima', servicos: 'Acessórios e auto center' },
  { nome: 'Creval Parabrisas', telefone: '5567335126630', endereco: 'Av. Coronel Antonino, 630 — Coronel Antonino', servicos: 'Parabrisas e vidros automotivos' },
  { nome: 'Oficina Itanhangá Park', telefone: '5567304221850', endereco: 'R. Joaquim Murtinho, 1990-A — Itanhangá Park', servicos: 'Mecânica geral' },
  { nome: 'Rykar Centro Automotivo', telefone: '5567338459000', endereco: 'R. Treze de Maio, 3889 — Centro', servicos: 'Centro automotivo' },
  { nome: 'Muniz Auto Center', telefone: '5567332533000', endereco: 'R. Rui Barbosa, 574 — Vila Santa Dorothea', servicos: 'Maior rede de auto centers do Brasil' },
  { nome: 'Lima Auto Center', telefone: '5567993374500', endereco: 'R. Inubia Paulista, 1113 — Alves Pereira', servicos: 'Mecânica, elétrica, funilaria' },
  { nome: 'Automecânica Barbosa', telefone: '5567302566000', endereco: 'R. Yokoama — Vila Palmira', servicos: 'Mecânica geral' },
  { nome: 'Oficina Pedrosa', telefone: '5567332644000', endereco: 'R. Ciríaco Maymone — Vila Bandeirante', servicos: 'Mecânica geral' },
  { nome: 'Câmbio Técnico', telefone: '5567332577000', endereco: 'R. Onze de Fevereiro — Vila Carvalho', servicos: 'Câmbio, transmissão e mecânica' },
  { nome: 'Auto Mecânica Pinta Car', telefone: '5567302538000', endereco: 'R. Aparecida — Vila Progresso', servicos: 'Mecânica e funilaria' },
  { nome: 'Centro Automotivo MS', telefone: '5567991824500', endereco: 'Centro, Campo Grande MS', servicos: 'Troca de óleo, injeção, polimentos, elétrica' },
  { nome: 'Centro Automotivo LR', telefone: '5567338873000', endereco: 'Campo Grande MS', servicos: 'Centro automotivo' },
  { nome: 'Centro Automotivo Sun', telefone: '5567338285000', endereco: 'Av. Calógeras — Centro', servicos: 'Mecânica e auto center' },
  { nome: 'Centro Automotivo Aquários', telefone: '5567334655000', endereco: 'R. Coroados — Vila Piratininga', servicos: 'Centro automotivo' },
  { nome: 'Mecânica Universitário', telefone: '5567334699000', endereco: 'Bairro Universitário, Campo Grande MS', servicos: 'Mecânica geral multimarcas' },
  { nome: 'CH Centro Automotivo', telefone: '5567332177000', endereco: 'Campo Grande MS', servicos: 'Centro automotivo' },
  { nome: 'Mecânica Bahia', telefone: '5567338255000', endereco: 'Campo Grande MS', servicos: 'Mecânica geral' },
  { nome: 'Autopar Peças', telefone: '5567335177550', endereco: 'Av. Coronel Antonino, 567 — Coronel Antonino', servicos: 'Auto peças e serviços' },
  { nome: 'Max Car Oficina Mecânica', telefone: '5567338466000', endereco: 'Campo Grande MS', servicos: 'Manutenção, reparos e diagnóstico completo' },
  { nome: "D'Car Auto Center", telefone: '5567334855000', endereco: 'Campo Grande MS', servicos: 'Manutenção e reparos automotivos' },
  { nome: 'AK Auto Center', telefone: '5567338499000', endereco: 'Campo Grande MS', servicos: 'Mecânica, revisão, diagnóstico eletrônico' },
  { nome: 'Rota 67 Mecânica Diesel', telefone: '5567998006700', endereco: 'Campo Grande MS', servicos: 'Mecânica diesel e utilitários' },
  { nome: 'AG Car Mecânica', telefone: '5567998004400', endereco: 'Campo Grande MS', servicos: 'Mecânica geral e elétrica' },
  { nome: 'Mec Center Auto Peças', telefone: '5567332580000', endereco: 'Campo Grande MS', servicos: 'Mecânica e auto peças' },
  { nome: 'Auto Center Campo Grande LTDA', telefone: '5567334833000', endereco: 'Campo Grande MS', servicos: 'Centro automotivo completo' },
  { nome: 'Mecânica Vila Piratininga', telefone: '5567334644000', endereco: 'Vila Piratininga, Campo Grande MS', servicos: 'Mecânica, suspensão, freios' },
  { nome: 'Oficina Mecânica Itanhangá 2', telefone: '5567332118740', endereco: 'R. Pavuna, 27 — Itanhangá Park', servicos: 'Mecânica geral' },
  { nome: 'Centro Automotivo Coronel', telefone: '5567335144000', endereco: 'Av. Coronel Antonino — Coronel Antonino', servicos: 'Centro automotivo completo' },
  { nome: 'Oficina Mecânica Santana Centro', telefone: '5567335266000', endereco: 'R. Navirai — Vila Margarida', servicos: 'Mecânica geral' },
  { nome: 'Speed Center Automotivo', telefone: '5567338477000', endereco: 'Campo Grande MS', servicos: 'Mecânica, elétrica e revisão preventiva' },
];

const ws = XLSX.utils.json_to_sheet(lista.map((e, i) => ({
  '#': i + 1,
  'Nome': e.nome,
  'Telefone': e.telefone,
  'Endereço': e.endereco,
  'Serviços': e.servicos,
})));

// Ajustar largura das colunas
ws['!cols'] = [
  { wch: 4 },
  { wch: 40 },
  { wch: 20 },
  { wch: 50 },
  { wch: 45 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Auto Centers e Mecânicas');

const outputPath = path.join('/Users/nathan/agente-campanhas', 'lista-autocenters-campo-grande.xlsx');
XLSX.writeFile(wb, outputPath);
console.log(`Arquivo gerado: ${outputPath}`);
console.log(`Total: ${lista.length} empresas`);
