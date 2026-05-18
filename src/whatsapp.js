require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

// Polyfill para Node.js 18 (crypto global necessário pelo Baileys)
const { webcrypto } = require("crypto");
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");
const fs = require("fs");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
const { buscarCampanhas, pausarCampanhaPorNome, formatarCampanhasParaPrompt } = require("./ferramentas");
const { iniciarMonitor } = require("./monitor-leads");

// ── CRM ───────────────────────────────────────────────────────────────────────

const CRM_FILE = path.join(__dirname, "../data/crm.json");

function lerCRMLocal() {
  try {
    if (fs.existsSync(CRM_FILE)) return JSON.parse(fs.readFileSync(CRM_FILE, "utf8"));
  } catch {}
  return [];
}

function adicionarLeadCRM(numero, nome, primeiraMensagem) {
  const fone = numero.replace(/@.*$/, "");
  const lista = lerCRMLocal();

  // Evita duplicata: mesmo número já no CRM
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

const CHATS_FILE    = path.join(__dirname, "../data/chats.json");
const PAUSADOS_FILE = path.join(__dirname, "../data/bot-pausados.json");

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

// Controle de pausas: quando você envia mensagem manualmente, o bot para naquele contato
function lerPausados() {
  try { if (fs.existsSync(PAUSADOS_FILE)) return JSON.parse(fs.readFileSync(PAUSADOS_FILE, "utf8")); } catch {}
  return [];
}
function pausarBot(fone) {
  const lista = lerPausados();
  if (!lista.includes(fone)) { lista.push(fone); fs.mkdirSync(path.dirname(PAUSADOS_FILE), { recursive: true }); fs.writeFileSync(PAUSADOS_FILE, JSON.stringify(lista)); }
}
function reativarBot(fone) {
  const lista = lerPausados().filter(f => f !== fone);
  fs.mkdirSync(path.dirname(PAUSADOS_FILE), { recursive: true });
  fs.writeFileSync(PAUSADOS_FILE, JSON.stringify(lista));
}
function botPausado(fone) {
  return lerPausados().includes(fone);
}

async function enviarMensagem(fone, texto) {
  if (!sockGlobal) throw new Error("WhatsApp não conectado");
  const jid = fone.includes("@") ? fone : `${fone}@s.whatsapp.net`;
  await sockGlobal.sendMessage(jid, { text: texto });
  salvarMensagem(fone, "eu", texto);
  // Quando você envia manualmente pelo dashboard, pausa o bot nesse contato
  pausarBot(fone.replace(/@.*$/, ""));
}

// ── Estado da conexão (exportado para o servidor) ─────────────────────────────

let waStatus = "desconectado"; // "desconectado" | "aguardando_qr" | "conectado"
let waQR = null;               // data URL base64 do QR code
let waAutoReconectar = true;

function getStatus() {
  return { status: waStatus, qr: waStatus === "aguardando_qr" ? waQR : null };
}

async function desconectar() {
  waAutoReconectar = false;
  waStatus = "desconectado";
  waQR = null;
  if (sockGlobal) {
    try { await sockGlobal.logout(); } catch (_) {}
    sockGlobal = null;
  }
}

// Referência global ao socket para envio de mensagens
let sockGlobal = null;

// ── Configurações ─────────────────────────────────────────────────────────────

// Número do dono no formato: 5511999999999 (sem + e sem @s.whatsapp.net)
const OWNER_NUMBER = process.env.WHATSAPP_OWNER;

// Mensagem exata que os leads mandam ao clicar no anúncio
const MENSAGEM_LEAD = "Olá! Preenchi seu formulário e gostaria de saber mais sobre sua empresa.";

// Prefixo para o dono conversar com o bot
const PREFIXO_DONO = "claude";

const MAX_HISTORICO = parseInt(process.env.WHATSAPP_MAX_HISTORICO || "20");

// ── Prompts ───────────────────────────────────────────────────────────────────

const PROMPT_LEAD = `Você é um consultor de vendas da 2oumais Marketing Digital, especializada em crescimento digital para negócios.

Seu único objetivo é agendar uma ligação rápida de 15 minutos com o Nathan, nosso especialista.

Fluxo obrigatório:
1. Cumprimente de forma calorosa e se apresente como da 2oumais
2. Faça APENAS UMA pergunta curta para entender o negócio (ex: "Qual é o seu segmento?" ou "Como você atrai clientes hoje?")
3. Com qualquer resposta, mostre empatia em UMA frase e já proponha: "Que tal uma ligação rápida de 15 minutos com o Nathan pra gente entender melhor e montar uma estratégia pra você? Fica melhor de manhã ou à tarde?"
4. Quando confirmar horário, responda: "Combinado! Nathan vai te ligar [horário confirmado]. Qualquer dúvida é só chamar aqui!"

Regras:
- Máximo 3 mensagens até fechar o agendamento
- Mensagens curtas, uma ideia por vez
- Tom caloroso, confiante e direto — como um consultor experiente
- Nunca mencione preços
- Não use asteriscos, underlines ou formatação markdown. Texto puro.`;

const PROMPT_DONO = `Você é o assistente pessoal do Nathan, sócio da 2oumais Marketing Digital.
Nathan conversa com você pelo WhatsApp usando o prefixo "claude" no início das mensagens.

Você pode ajudá-lo com qualquer coisa: responder dúvidas, resumir textos, criar conteúdos, analisar dados de campanhas, sugerir estratégias, rascunhar mensagens, ou simplesmente conversar.

Quando Nathan pedir para ver campanhas, o sistema já vai incluir os dados reais antes da sua resposta — analise e comente sobre eles.

Quando Nathan pedir para enviar uma mensagem para alguém, responda EXATAMENTE neste formato JSON (sem mais nada):
{"acao":"enviar_mensagem","numero":"5511999999999","mensagem":"texto aqui"}

Quando Nathan pedir para pausar uma campanha, responda EXATAMENTE neste formato JSON (sem mais nada):
{"acao":"pausar_campanha","nome":"nome parcial da campanha"}

Seja direto, prático e objetivo. Responda como se fosse uma conversa natural de WhatsApp.`;

// ── Históricos de conversa ────────────────────────────────────────────────────

const historicos = new Map();

async function responder(numero, mensagem, systemPrompt, isDono = false) {
  if (!historicos.has(numero)) historicos.set(numero, []);

  const historico = historicos.get(numero);

  // Se for o dono e perguntar sobre campanhas, busca dados reais
  let conteudoFinal = mensagem;
  if (isDono && /campanha|gasto|lead|cpl|anuncio|anúncio|resultado|meta ads|performance/i.test(mensagem)) {
    try {
      const dados = await buscarCampanhas();
      const resumo = formatarCampanhasParaPrompt(dados);
      conteudoFinal = `${mensagem}\n\n[Dados atuais das campanhas - últimas 24h]\n${resumo}`;
    } catch (e) {
      conteudoFinal = `${mensagem}\n\n[Erro ao buscar dados das campanhas: ${e.message}]`;
    }
  }

  historico.push({ role: "user", content: conteudoFinal });

  if (historico.length > MAX_HISTORICO) {
    historico.splice(0, historico.length - MAX_HISTORICO);
  }

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: historico,
  });

  const resposta = response.content[0].text;
  historico.push({ role: "assistant", content: resposta });

  // Verifica se o Claude quer executar uma ação
  if (isDono) {
    try {
      const jsonMatch = resposta.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const acao = JSON.parse(jsonMatch[0]);

        if (acao.acao === "enviar_mensagem" && acao.numero && acao.mensagem && sockGlobal) {
          const jidDestino = acao.numero.includes("@") ? acao.numero : `${acao.numero}@s.whatsapp.net`;
          await sockGlobal.sendMessage(jidDestino, { text: acao.mensagem });
          return `✓ Mensagem enviada para ${acao.numero}:\n"${acao.mensagem}"`;
        }

        if (acao.acao === "pausar_campanha" && acao.nome) {
          const resultado = await pausarCampanhaPorNome(acao.nome);
          return resultado;
        }
      }
    } catch (_) {}
  }

  return resposta;
}

// ── Lógica de roteamento ──────────────────────────────────────────────────────

// ── Lista de disparados ───────────────────────────────────────────────────────

const DISPARADOS_FILE = path.join(__dirname, "../data/disparados.json");

function lerDisparados() {
  try {
    if (fs.existsSync(DISPARADOS_FILE)) return JSON.parse(fs.readFileSync(DISPARADOS_FILE, "utf8"));
  } catch {}
  return [];
}

function foiDisparado(fone) {
  return lerDisparados().includes(fone);
}

function classificarMensagem(numero, texto) {
  const jid = `${OWNER_NUMBER}@s.whatsapp.net`;
  const isOwner = numero === jid || numero.endsWith("@lid");
  const fone = numero.replace(/@.*$/, "");

  // 1. Dono usando prefixo "claude"
  if (OWNER_NUMBER && isOwner && texto.toLowerCase().startsWith(PREFIXO_DONO)) {
    const pergunta = texto.slice(PREFIXO_DONO.length).trim();
    return { tipo: "dono", conteudo: pergunta || texto };
  }

  // 2. Bot pausado neste contato (você assumiu a conversa manualmente)
  if (botPausado(fone)) {
    return { tipo: "ignorar" };
  }

  // 3. Só responde quem recebeu disparo
  if (!foiDisparado(fone)) {
    return { tipo: "ignorar" };
  }

  // 4. Lead em conversa já iniciada
  if (historicos.has(numero + "_lead")) {
    return { tipo: "lead_continuacao", conteudo: texto };
  }

  // 5. Primeiro contato do lead
  return { tipo: "lead", conteudo: texto };
}

// ── Conexão WhatsApp ──────────────────────────────────────────────────────────

async function iniciarWhatsApp() {
  if (waStatus !== "desconectado") return;
  waStatus = "aguardando_qr";
  waAutoReconectar = true;

  const authDir = path.join(__dirname, "../.whatsapp-auth");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log("\n=== 2oumais WhatsApp Bot ===");
  console.log(`Baileys: ${version.join(".")}`);
  if (OWNER_NUMBER) console.log(`Dono configurado: ${OWNER_NUMBER}`);
  console.log("Iniciando conexão...\n");

  const pino = require("pino");
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "warn" }),
  });

  sockGlobal = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      waStatus = "aguardando_qr";
      console.log("Escaneie o QR Code com seu WhatsApp:\n");
      qrcode.generate(qr, { small: true });

      QRCode.toDataURL(qr, { width: 400 }, (err, url) => {
        if (!err) {
          waQR = url;
          // Salva também como arquivo HTML para acesso via navegador
          const qrPath = path.join(__dirname, "../qrcode.html");
          fs.writeFileSync(qrPath, `<!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;flex-direction:column"><h2 style="color:#fff;font-family:sans-serif;margin-bottom:20px">Escaneie com o WhatsApp</h2><img src="${url}" style="border-radius:12px"/><p style="color:#888;font-family:sans-serif;margin-top:16px">Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo</p></body></html>`);
          console.log(`\n→ QR Code salvo! Abra no navegador: file://${qrPath}\n`);
        }
      });
    }
    if (connection === "open") {
      waStatus = "conectado";
      waQR = null;
      console.log("\n✓ WhatsApp conectado!\n");
      console.log("Aguardando mensagens...");
      console.log("  → Lead (anúncio): responde automaticamente");
      console.log(`  → Você (prefixo "claude"): responde como assistente`);
      console.log("  → Outros: ignora\n");
      iniciarMonitor(sock);
    }
    if (connection === "close") {
      waStatus = "desconectado";
      waQR = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reconectar = statusCode !== DisconnectReason.loggedOut && waAutoReconectar;
      if (reconectar) {
        console.log(`Reconectando em 3s...`);
        setTimeout(iniciarWhatsApp, 3000);
      } else {
        console.log("Sessão encerrada. Delete .whatsapp-auth e reinicie.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.remoteJid === "status@broadcast") continue;

      if (msg.key.remoteJid.endsWith("@g.us")) continue;

      // Permite mensagens do próprio dono (fromMe) somente se for para si mesmo com prefixo "claude"
      const ownerJid = OWNER_NUMBER ? `${OWNER_NUMBER}@s.whatsapp.net` : null;
      // WhatsApp pode usar formato @lid internamente — considera self-message qualquer fromMe=false vindo de @lid ou do próprio número
      const isLid = msg.key.remoteJid.endsWith("@lid");
      const isSelfMessage = (msg.key.fromMe && msg.key.remoteJid === ownerJid) || (!msg.key.fromMe && isLid);

      const numero = msg.key.remoteJid;
      const nome = msg.pushName || numero;

      // Qualquer mensagem recebida de contato externo → adiciona ao CRM
      // (antes da checagem de texto, para capturar foto, áudio, figurinha, etc.)
      if (!msg.key.fromMe && !isLid) {
        const textoPreview =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          (msg.message?.audioMessage ? "[áudio]" : null) ||
          (msg.message?.imageMessage ? "[imagem]" : null) ||
          (msg.message?.videoMessage ? "[vídeo]" : null) ||
          (msg.message?.documentMessage ? "[documento]" : null) ||
          (msg.message?.stickerMessage ? "[figurinha]" : null) ||
          "[mensagem]";
        adicionarLeadCRM(numero, nome, textoPreview);
      }

      const texto =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text;

      if (!texto) continue;

      if (msg.key.fromMe && !isSelfMessage) continue;
      if (isSelfMessage && !texto.toLowerCase().startsWith(PREFIXO_DONO)) continue;

      // Salva mensagem recebida no histórico do chat
      const foneNum = numero.replace(/@.*$/, "");
      salvarMensagem(foneNum, "lead", texto);

      const classificacao = classificarMensagem(numero, texto);

      if (classificacao.tipo === "ignorar") {
        console.log(`[${hora()}] [ignorado] ${nome}: ${texto.slice(0, 60)}`);
        continue;
      }

      console.log(`[${hora()}] [${classificacao.tipo}] ${nome}: ${texto.slice(0, 80)}`);

      try {
        await sock.readMessages([msg.key]);
        await sock.sendPresenceUpdate("composing", numero);

        let resposta;

        if (classificacao.tipo === "dono") {
          resposta = await responder(numero + "_dono", classificacao.conteudo, PROMPT_DONO, true);
        } else {
          // lead ou lead_continuacao
          resposta = await responder(numero + "_lead", classificacao.conteudo, PROMPT_LEAD);
        }

        await sock.sendPresenceUpdate("paused", numero);
        await sock.sendMessage(numero, { text: resposta });
        salvarMensagem(foneNum, "eu", resposta);

        console.log(`[${hora()}] → ${resposta.slice(0, 80)}${resposta.length > 80 ? "..." : ""}\n`);
      } catch (err) {
        console.error(`[ERRO] ${nome}: ${err.message}`);
        await sock.sendPresenceUpdate("paused", numero);
      }
    }
  });
}

function hora() {
  return new Date().toLocaleTimeString("pt-BR");
}

module.exports = { iniciarWhatsApp, getStatus, desconectar, enviarMensagem, lerChats, pausarBot, reativarBot, botPausado };

// Quando executado diretamente (node src/whatsapp.js), inicia automaticamente
if (require.main === module) {
  iniciarWhatsApp().catch(console.error);
}
