require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BASE = `https://graph.facebook.com/${process.env.META_API_VERSION || "v19.0"}`;
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const OWNER = process.env.WHATSAPP_OWNER;

const ESTADO_FILE = path.join(__dirname, "../data/leads-vistos.json");
const INTERVALO_MS = 15 * 60 * 1000; // 15 minutos

// ── Estado persistido ─────────────────────────────────────────────────────────

function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO_FILE, "utf8"));
  } catch {
    return { ultimaVerificacao: null, leadsVistos: [] };
  }
}

function salvarEstado(estado) {
  fs.mkdirSync(path.dirname(ESTADO_FILE), { recursive: true });
  fs.writeFileSync(ESTADO_FILE, JSON.stringify(estado, null, 2));
}

// ── Busca leads da conta ──────────────────────────────────────────────────────

async function buscarLeadsRecentes() {
  // Busca formulários ativos da conta
  const resCamp = await axios.get(`${BASE}/${ACCOUNT}/campaigns`, {
    params: {
      effective_status: JSON.stringify(["ACTIVE"]),
      fields: "id,name",
      access_token: TOKEN,
    },
  });

  const campanhas = resCamp.data.data || [];
  const leads = [];

  for (const camp of campanhas) {
    try {
      // Busca os ads com lead_gen_form_id
      const resAds = await axios.get(`${BASE}/${camp.id}/ads`, {
        params: {
          fields: "id,creative{object_story_spec,asset_feed_spec}",
          access_token: TOKEN,
        },
      });

      const formIds = new Set();
      for (const ad of resAds.data.data || []) {
        const formId =
          ad.creative?.object_story_spec?.link_data?.call_to_action?.value?.lead_gen_form_id ||
          ad.creative?.asset_feed_spec?.call_to_actions?.[0]?.value?.lead_gen_form_id;
        if (formId) formIds.add(formId);
      }

      // Busca leads de cada formulário
      for (const formId of formIds) {
        try {
          const resLeads = await axios.get(`${BASE}/${formId}/leads`, {
            params: {
              fields: "id,created_time,field_data",
              limit: 20,
              access_token: TOKEN,
            },
          });

          for (const lead of resLeads.data.data || []) {
            leads.push({ ...lead, campanhaNome: camp.name, formId });
          }
        } catch {
          // sem permissão para este formulário
        }
      }
    } catch {
      // ignora campanha com erro
    }
  }

  return leads;
}

// ── Formata mensagem de alerta ────────────────────────────────────────────────

function formatarAlerta(lead) {
  const campos = {};
  for (const f of lead.field_data || []) {
    campos[f.name] = f.values?.[0] || "";
  }

  const nome = campos["full_name"] || campos["nome"] || campos["name"] || "Não informado";
  const email = campos["email"] || "Não informado";
  const fone = campos["phone_number"] || campos["telefone"] || campos["phone"] || "Não informado";

  const hora = new Date(lead.created_time).toLocaleString("pt-BR", { timeZone: "America/Campo_Grande" });

  return `🔔 *Novo Lead!*\n\n👤 ${nome}\n📧 ${email}\n📱 ${fone}\n📢 ${lead.campanhaNome}\n🕐 ${hora}`;
}

// ── Ciclo de verificação ──────────────────────────────────────────────────────

async function verificar(sockGlobal) {
  if (!sockGlobal) return;

  const estado = lerEstado();

  try {
    const leads = await buscarLeadsRecentes();

    const novos = leads.filter(l => !estado.leadsVistos.includes(l.id));

    if (novos.length > 0) {
      console.log(`[monitor] ${novos.length} novo(s) lead(s) encontrado(s)!`);

      const jid = `${OWNER}@s.whatsapp.net`;

      for (const lead of novos) {
        const msg = formatarAlerta(lead);
        await sockGlobal.sendMessage(jid, { text: msg });
        console.log(`[monitor] Alerta enviado para ${OWNER}: ${lead.id}`);
      }

      estado.leadsVistos = [
        ...estado.leadsVistos,
        ...novos.map(l => l.id),
      ].slice(-500); // guarda os últimos 500 IDs
    } else {
      console.log(`[monitor] Nenhum lead novo (${new Date().toLocaleTimeString("pt-BR")})`);
    }

    estado.ultimaVerificacao = new Date().toISOString();
    salvarEstado(estado);
  } catch (err) {
    console.error("[monitor] Erro:", err.message);
  }
}

// ── Iniciar monitor ───────────────────────────────────────────────────────────

function iniciarMonitor(sockGlobal) {
  console.log(`[monitor] Iniciado — verificando leads a cada 15 minutos`);

  // Primeira verificação após 1 minuto (tempo para o bot conectar)
  setTimeout(() => {
    verificar(sockGlobal);
    setInterval(() => verificar(sockGlobal), INTERVALO_MS);
  }, 60 * 1000);
}

module.exports = { iniciarMonitor };
