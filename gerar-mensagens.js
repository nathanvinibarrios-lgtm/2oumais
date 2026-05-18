const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '/Users/nathan/agente-campanhas/.env' });
const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const clinicas = [
  { nome: 'Clínica de Estética Dra. Fran', contato: 'Dra. Fran', fone: '5567992339611', estrelas: 4.7, avaliacoes: 151, perfil: 'Biomedicina e Farmácia, especialista em preenchimento facial, HIFU, criolipólise, harmonização glútea e bioestimulador corporal.' },
  { nome: 'Royal Face Clínica de Estética', contato: 'proprietária', fone: '5567992377435', estrelas: 4.3, avaliacoes: 81, perfil: 'Mais de 40 procedimentos: botox, fios, preenchimento, carboxiterapia e radiofrequência.' },
  { nome: 'Clínica Dra. Andréia Campelo', contato: 'Dra. Andréia', fone: '5567999459750', estrelas: 5, avaliacoes: 61, perfil: 'Estética avançada, melasma, botox, otomodelação e harmonização facial.' },
  { nome: 'Emporium da Beleza', contato: 'proprietária', fone: '5567999585655', estrelas: 4.6, avaliacoes: 100, perfil: 'Clínica de estética completa com tratamentos faciais e corporais em Campo Grande.' },
  { nome: 'Hollywood Saúde e Beleza', contato: 'proprietária', fone: '5567991321352', estrelas: 4.7, avaliacoes: 198, perfil: 'Saúde e beleza com ampla variedade de tratamentos estéticos.' },
  { nome: 'Consultório Dra. Adriana Lima', contato: 'Dra. Adriana', fone: '5567999241919', estrelas: 5, avaliacoes: 216, perfil: 'Estética avançada, uma das mais bem avaliadas de Campo Grande com 216 avaliações.' },
  { nome: 'Clínica Cláudia Massolim', contato: 'Dra. Cláudia', fone: '5567981681301', estrelas: 4.9, avaliacoes: 47, perfil: 'Estética avançada com foco em resultados naturais e atendimento personalizado.' },
  { nome: 'Vitae Clinica de Estética Avançada', contato: 'proprietária', fone: '5567993395863', estrelas: 5, avaliacoes: 99, perfil: 'Estética avançada no Centro de Campo Grande.' },
  { nome: 'Clínica Dra. Pauliella Martins', contato: 'Dra. Pauliella', fone: '5567981565202', estrelas: 4.9, avaliacoes: 17, perfil: 'Estética avançada em Campo Grande.' },
  { nome: 'Clínica Carolline Ferreira', contato: 'Dra. Carolline', fone: '5567993345009', estrelas: 4.9, avaliacoes: 42, perfil: 'Estética facial e corporal com atendimento personalizado.' },
];

const ROTEIRO = `Crie uma mensagem de WhatsApp de prospecção seguindo este roteiro:

1. Cumprimento pelo nome do contato
2. "Aqui é o Nathan, somos uma empresa parceira do Google."
3. Comente algo específico dos serviços/diferenciais da clínica e mencione as estrelas e avaliações
4. "Para perfis acima de 4 estrelas no Google liberamos uma consultoria gratuita com nossa equipe."
5. "Gostaríamos de marcar uma visita com a proprietária para receber nossa equipe."
6. "É uma consultoria gratuita com o objetivo de mostrar como aumentar o número de clientes pelo Google. Vamos mostrar estratégias que podem te ajudar muito!"
7. "Podemos marcar? Qual horário fica melhor pra você?"

REGRAS: Texto puro, sem asteriscos ou markdown. Natural como WhatsApp. Máximo 8 linhas.`;

async function gerarMensagem(c) {
  const prompt = `${ROTEIRO}\n\nCLÍNICA: ${c.nome}\nCONTATO: ${c.contato}\nESTRELAS: ${c.estrelas}\nAVALIAÇÕES: ${c.avaliacoes}\nPERFIL: ${c.perfil}`;
  const r = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 350,
    messages: [{ role: 'user', content: prompt }]
  });
  return { fone: c.fone, nome: c.nome, mensagem: r.content[0].text };
}

async function main() {
  const resultados = [];
  for (const c of clinicas) {
    process.stderr.write(`Gerando: ${c.nome}...\n`);
    const r = await gerarMensagem(c);
    resultados.push(r);
  }
  console.log(JSON.stringify(resultados, null, 2));
}
main().catch(console.error);
