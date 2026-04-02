require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const axios = require("axios");
const path = require("path");
const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk");

const { buscarCampanhas, pausarCampanhaPorNome, formatarCampanhasParaPrompt } = require("./ferramentas");

// ── Config Z-API ──────────────────────────────────────────────────────────────

const INSTANCE_ID    = process.env.ZAPI_INSTANCE_ID;
const TOKEN          = process.env.ZAPI_TOKEN;
const CLIENT_TOKEN   = process.env.ZAPI_CLIENT_TOKEN;
const BASE_URL       = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}`;
const HEADERS        = { "Client-Token": CLIENT_TOKEN };

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── CRM ───────────────────────────────────────────────────────────────────────

const CRM_FILE   = path.join(__dirname, "../data/crm.json");
const CHATS_FILE = path.join(__dirname, "../data/chats.json");

function lerCRM() {
  try { if (fs.existsSync(CRM_FILE)) return JSON.parse(fs.readFileSync(CRM_FILE, "utf8")); } catch {}
  return [];
}

function adicionarLeadCRM(fone, nome, primeiraMensagem) {
  const lista = lerCRM();
  if (lista.some(l => l.fone === fone)) return false;

  const lead = {
    id: Date.now(),
    nome: nome || fone,
    empresa: "",
    fone,
    email: "",
    valor: "",
    fonte: "WhatsApp",
    etapa: "novo",
    obs: primeiraMensagem ? `Primeira mensagem: "${primeiraMensagem.slice(0, 200)}"` : "",
    criadoEm: new Date().toISOString(),
  };

  lista.unshift(lead);
  fs.mkdirSync(path.dirname(CRM_FILE), { recursive: true });
  fs.writeFileSync(CRM_FILE, JSON.stringify(lista, null, 2));
  console.log(`[CRM] ✓ Novo lead: ${lead.nome} (${fone})`);
  return true;
}

// ── Chat history ──────────────────────────────────────────────────────────────

function lerChats() {
  try { if (fs.existsSync(CHATS_FILE)) return JSON.parse(fs.readFileSync(CHATS_FILE, "utf8")); } catch {}
  return {};
}

function salvarMensagem(fone, de, texto) {
  const chats = lerChats();
  if (!chats[fone]) chats[fone] = [];
  chats[fone].push({ de, texto, ts: new Date().toISOString() });
  if (chats[fone].length > 200) chats[fone] = chats[fone].slice(-200);
  fs.mkdirSync(path.dirname(CHATS_FILE), { recursive: true });
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats));
}

// ── Envio via Z-API ───────────────────────────────────────────────────────────

async function enviarMensagem(fone, texto) {
  const foneFormatado = fone.replace(/\D/g, "");
  await axios.post(`${BASE_URL}/send-text`, {
    phone: foneFormatado,
    message: texto,
  }, { headers: HEADERS });
  salvarMensagem(foneFormatado, "eu", texto);
}

// ── Status / QR Code ──────────────────────────────────────────────────────────

async function getStatus() {
  try {
    const r = await axios.get(`${BASE_URL}/status`, { headers: HEADERS });
    return r.data;
  } catch (e) {
    return { error: e.message };
  }
}

async function getQRCode() {
  try {
    const r = await axios.get(`${BASE_URL}/qr-code/image`, { headers: HEADERS, responseType: "arraybuffer" });
    const base64 = Buffer.from(r.data).toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

// ── IA ────────────────────────────────────────────────────────────────────────

const OWNER_NUMBER    = process.env.WHATSAPP_OWNER;
const PREFIXO_DONO    = "claude";
const MAX_HISTORICO   = parseInt(process.env.WHATSAPP_MAX_HISTORICO || "20");

const PROMPT_LEAD = `Você é um consultor de vendas da 2oumais Marketing Digital, empresa especializada em crescimento digital para negócios.

Nossos serviços:
- Gestão de tráfego pago (Meta Ads e Google Ads)
- Instalação e configuração de CRM
- Criação e edição de sites
- Criação de criativos para anúncios
- Implementação de funil de vendas online

Seu objetivo é simples e direto: fazer UMA pergunta para entender o negócio do lead e logo em seguida propor um agendamento de ligação com nosso especialista (Nathan).

Fluxo:
1. Cumprimente de forma calorosa, se apresente como da 2oumais
2. Faça UMA pergunta para entender o negócio (ex: "Qual é o seu segmento?" ou "Qual seu maior desafio hoje com marketing?")
3. Com a resposta, mostre que entende o problema e proponha imediatamente: "Posso agendar uma ligação rápida de 15 minutos com nosso especialista para entender melhor e montar uma proposta. Qual horário fica melhor para você, manhã ou tarde?"
4. Confirme o agendamento e diga que Nathan vai entrar em contato no horário combinado

Tom: profissional, simpático e direto. Mensagens curtas como numa conversa de WhatsApp.
Nunca mencione preços. Se perguntarem valores, diga que o especialista vai apresentar uma proposta personalizada na ligação.`;

const PROMPT_DONO = `Você é o assistente pessoal do Nathan, sócio da 2oumais Marketing Digital.
Nathan conversa com você pelo WhatsApp usando o prefixo "claude" no início das mensagens.

Você pode ajudá-lo com qualquer coisa: responder dúvidas, resumir textos, criar conteúdos, analisar dados de campanhas, sugerir estratégias, rascunhar mensagens, ou simplesmente conversar.

Quando Nathan pedir para ver campanhas, o sistema já vai incluir os dados reais antes da sua resposta — analise e comente sobre eles.

Quando Nathan pedir para enviar uma mensagem para alguém, responda EXATAMENTE neste formato JSON (sem mais nada):
{"acao":"enviar_mensagem","numero":"5511999999999","mensagem":"texto aqui"}

Quando Nathan pedir para pausar uma campanha, responda EXATAMENTE neste formato JSON (sem mais nada):
{"acao":"pausar_campanha","nome":"nome parcial da campanha"}

Seja direto, prático e objetivo. Responda como se fosse uma conversa natural de WhatsApp.`;

const historicos = new Map();

async function responder(chaveHistorico, mensagem, systemPrompt, isDono = false) {
  if (!historicos.has(chaveHistorico)) historicos.set(chaveHistorico, []);
  const historico = historicos.get(chaveHistorico);

  let conteudoFinal = mensagem;
  if (isDono && /campanha|gasto|lead|cpl|anuncio|anúncio|resultado|meta ads|performance/i.test(mensagem)) {
    try {
      const dados = await buscarCampanhas();
      const resumo = formatarCampanhasParaPrompt(dados);
      conteudoFinal = `${mensagem}\n\n[Dados atuais das campanhas - últimas 24h]\n${resumo}`;
    } catch (e) {
      conteudoFinal = `${mensagem}\n\n[Erro ao buscar dados: ${e.message}]`;
    }
  }

  historico.push({ role: "user", content: conteudoFinal });
  if (historico.length > MAX_HISTORICO) historico.splice(0, historico.length - MAX_HISTORICO);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: historico,
  });

  const resposta = response.content[0].text;
  historico.push({ role: "assistant", content: resposta });

  if (isDono) {
    try {
      const jsonMatch = resposta.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const acao = JSON.parse(jsonMatch[0]);
        if (acao.acao === "enviar_mensagem" && acao.numero && acao.mensagem) {
          await enviarMensagem(acao.numero, acao.mensagem);
          return `✓ Mensagem enviada para ${acao.numero}:\n"${acao.mensagem}"`;
        }
        if (acao.acao === "pausar_campanha" && acao.nome) {
          return await pausarCampanhaPorNome(acao.nome);
        }
      }
    } catch (_) {}
  }

  return resposta;
}

// ── Processamento do webhook ──────────────────────────────────────────────────

async function processarWebhook(body) {
  // Z-API envia vários tipos de callback — filtra só mensagens recebidas
  if (body.type !== "ReceivedCallback") return;

  const fone = (body.phone || "").replace(/\D/g, "");
  const nome = body.senderName || fone;
  const fromMe = body.fromMe || false;

  // Ignora mensagens enviadas por nós mesmos (exceto dono com prefixo)
  if (fromMe) return;

  const texto = body.text?.message || body.image?.caption || body.audio?.audioUrl && "[áudio]" || body.document?.caption || "[mensagem]";

  // Adiciona ao CRM
  adicionarLeadCRM(fone, nome, texto === "[mensagem]" ? "" : texto);

  // Salva no histórico de chat
  salvarMensagem(fone, "lead", texto);

  if (!texto || texto.startsWith("[")) return; // sem texto → não responde

  const isOwner = fone === OWNER_NUMBER;

  if (isOwner && texto.toLowerCase().startsWith(PREFIXO_DONO)) {
    const pergunta = texto.slice(PREFIXO_DONO.length).trim();
    try {
      const resposta = await responder(fone + "_dono", pergunta || texto, PROMPT_DONO, true);
      await enviarMensagem(fone, resposta);
      salvarMensagem(fone, "eu", resposta);
    } catch (e) {
      console.error("[ZAPI] Erro resposta dono:", e.message);
    }
    return;
  }

  // Lead — responde com IA de vendas
  try {
    const resposta = await responder(fone + "_lead", texto, PROMPT_LEAD);
    await enviarMensagem(fone, resposta);
    salvarMensagem(fone, "eu", resposta);
  } catch (e) {
    console.error("[ZAPI] Erro resposta lead:", e.message);
  }
}

module.exports = { processarWebhook, enviarMensagem, getStatus, getQRCode, lerChats };
