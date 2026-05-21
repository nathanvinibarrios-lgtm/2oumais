require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const { gerarDocx, gerarPDF } = require("./contrato");

// Usa disco persistente em produção (/data) ou pasta local em dev
const DATA_DIR = fs.existsSync("/data") ? "/data" : path.join(__dirname, "../data");

// Copia arquivos iniciais do git para o disco persistente (apenas se não existirem)
if (fs.existsSync("/data")) {
  const SEED_DIR = path.join(__dirname, "../data");
  fs.mkdirSync("/data", { recursive: true });
  if (fs.existsSync(SEED_DIR)) {
    for (const file of fs.readdirSync(SEED_DIR)) {
      const dest = path.join("/data", file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(SEED_DIR, file), dest);
        console.log(`[init] copiado ${file} para disco persistente`);
      }
    }
  }
}

const CONVERSOES_FILE  = path.join(DATA_DIR, "conversoes.json");
const CONTRATOS_FILE   = path.join(DATA_DIR, "contratos.json");
const OPERACOES_FILE         = path.join(DATA_DIR, "operacoes.json");
const OPERACOES_COLUNAS_FILE = path.join(DATA_DIR, "operacoes-colunas.json");
const FINANCEIRO_FILE        = path.join(DATA_DIR, "financeiro.json");
const PAGAMENTOS_FILE        = path.join(DATA_DIR, "pagamentos.json");

const DEFAULT_OPERACOES_COLUNAS = [
  { key: "onboarding", label: "Onboarding / Briefing" },
  { key: "criativos",  label: "Criativos + Planejamento" },
  { key: "ativo",      label: "Ativo" },
];
const TEMPLATE_FILE    = path.join(DATA_DIR, "template-contrato.txt");
const CRM_FILE         = path.join(DATA_DIR, "crm.json");
const CRM_CONFIG_FILE  = path.join(DATA_DIR, "crm-config.json");
const FUNIL_CONFIG_FILE= path.join(DATA_DIR, "funil-config.json");
const AGENDA_FILE      = path.join(DATA_DIR, "agenda.json");

const DEFAULT_CRM_COLUNAS = [
  { key: "novo",     label: "Novo Lead"         },
  { key: "contato",  label: "Contato Feito"      },
  { key: "reuniao",  label: "Reunião Agendada"   },
  { key: "proposta", label: "Proposta Enviada"   },
  { key: "fechado",  label: "Fechado"            },
  { key: "perdido",  label: "Perdido"            },
];
const DEFAULT_FUNIL_LABELS = ["Impressões", "Cliques", "Leads", "Reuniões", "Vendas"];

function lerCRM() {
  try { if (fs.existsSync(CRM_FILE)) return JSON.parse(fs.readFileSync(CRM_FILE, "utf8")); } catch {}
  return [];
}
function salvarCRM(lista) {
  fs.mkdirSync(path.dirname(CRM_FILE), { recursive: true });
  fs.writeFileSync(CRM_FILE, JSON.stringify(lista, null, 2));
}
function lerCRMConfig() {
  try { if (fs.existsSync(CRM_CONFIG_FILE)) return JSON.parse(fs.readFileSync(CRM_CONFIG_FILE, "utf8")); } catch {}
  return DEFAULT_CRM_COLUNAS;
}
function lerFunilConfig() {
  try { if (fs.existsSync(FUNIL_CONFIG_FILE)) return JSON.parse(fs.readFileSync(FUNIL_CONFIG_FILE, "utf8")); } catch {}
  return DEFAULT_FUNIL_LABELS;
}
function lerAgenda() {
  try { if (fs.existsSync(AGENDA_FILE)) return JSON.parse(fs.readFileSync(AGENDA_FILE, "utf8")); } catch {}
  return [];
}
function salvarAgenda(lista) {
  fs.mkdirSync(path.dirname(AGENDA_FILE), { recursive: true });
  fs.writeFileSync(AGENDA_FILE, JSON.stringify(lista, null, 2));
}

function lerConversoes() {
  try {
    if (fs.existsSync(CONVERSOES_FILE)) return JSON.parse(fs.readFileSync(CONVERSOES_FILE, "utf8"));
  } catch {}
  return { 1: { reunioes: 0, vendas: 0, receita: 0 }, 7: { reunioes: 0, vendas: 0, receita: 0 }, 15: { reunioes: 0, vendas: 0, receita: 0 } };
}

function salvarConversoes(data) {
  fs.mkdirSync(path.dirname(CONVERSOES_FILE), { recursive: true });
  fs.writeFileSync(CONVERSOES_FILE, JSON.stringify(data, null, 2));
}

function lerContratos() {
  try {
    if (fs.existsSync(CONTRATOS_FILE)) return JSON.parse(fs.readFileSync(CONTRATOS_FILE, "utf8"));
  } catch {}
  return [];
}

function salvarContratos(lista) {
  fs.mkdirSync(path.dirname(CONTRATOS_FILE), { recursive: true });
  fs.writeFileSync(CONTRATOS_FILE, JSON.stringify(lista, null, 2));
}

function calcularStatus(dataInicio, duracaoMeses) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const inicio = new Date(dataInicio);
  const fim = new Date(inicio);
  fim.setMonth(fim.getMonth() + parseInt(duracaoMeses || 6));
  const diasRestantes = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
  if (diasRestantes < 0)   return { status: "vencido",   diasRestantes, dataFim: fim.toISOString().split("T")[0] };
  if (diasRestantes <= 30) return { status: "a_vencer",  diasRestantes, dataFim: fim.toISOString().split("T")[0] };
  return                          { status: "ativo",      diasRestantes, dataFim: fim.toISOString().split("T")[0] };
}
const {
  getCampanhasAtivas,
  getInsightsCampanha,
  getInsightsPorAnuncio,
  getAnunciosAtivos,
  extrairLeads,
  pausarCampanha,
  getLeadsMeta,
} = require("./metaClient");
const { getCampanhasGoogle, getKeywordsGoogle } = require("./googleClient");

const app = express();
const PORT = process.env.PORT || 3000;
const CPL_LIMITE = parseFloat(process.env.CPL_LIMITE || "50");
const DRY_RUN = process.env.DRY_RUN === "true";
const INTERVALO_MS = 5 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || "secret_padrao_troque";
const USERS_FILE = path.join(DATA_DIR, "users.json");

const crypto = require("crypto");
function hashSenha(s) { return crypto.createHash("sha256").update(s).digest("hex"); }

const ALL_VIEWS = ["campanhas","google","funil","crm","agenda","prospeccao","operacoes","financeiro","contratos"];

function lerUsuarios() {
  try { if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch {}
  return [];
}
function salvarUsuarios(lista) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(lista, null, 2));
}

// Cache por período
const caches = { 1: null, 7: null, 15: null };

function gerarSugestoes(campanha, anunciosDaCampanha) {
  const s = [];

  if (campanha.cpl !== null && campanha.cpl > CPL_LIMITE) {
    const pct = (((campanha.cpl - CPL_LIMITE) / CPL_LIMITE) * 100).toFixed(0);
    s.push(`CPL ${pct}% acima do limite — revise público-alvo ou troque criativos`);
  }

  if (campanha.status === "sem_leads" && campanha.gasto > 30) {
    s.push(`R$${campanha.gasto.toFixed(0)} gastos sem nenhum lead — verifique o formulário e a landing page`);
  }

  if (campanha.leads > 0 && campanha.cpl !== null && campanha.cpl < CPL_LIMITE * 0.6) {
    s.push(`Excelente CPL — considere aumentar o orçamento para escalar`);
  }

  const badCtr = anunciosDaCampanha.filter(a => a.impressoes > 500 && a.ctr < 1);
  if (badCtr.length > 0) {
    s.push(`${badCtr.length} criativo(s) com CTR < 1% — teste novas imagens ou headlines`);
  }

  if (campanha.impressoes > 5000 && campanha.cliques === 0) {
    s.push(`Muitas impressões sem cliques — revise o criativo e o CTA`);
  }

  if (s.length === 0 && campanha.status === "ok") {
    s.push(`Performance dentro do esperado`);
  }

  return s;
}

async function coletarDados(dias) {
  console.log(`[${new Date().toLocaleTimeString("pt-BR")}] Coletando dados ${dias}d...`);
  try {
    const campanhasAtivas = await getCampanhasAtivas();
    const resultados = [];
    const todosAnuncios = [];
    let pausadas = 0;

    for (const campanha of campanhasAtivas) {
      try {
        const insights = await getInsightsCampanha(campanha.id, dias);
        if (!insights) {
          resultados.push({ id: campanha.id, nome: campanha.name, status: "sem_dados", gasto: 0, leads: 0, cpl: null, impressoes: 0, cliques: 0, sugestoes: [], anuncios: [] });
          continue;
        }

        const gasto = parseFloat(insights.spend || "0");
        const leads = extrairLeads(insights.actions);
        const cpl = leads > 0 ? gasto / leads : null;
        const impressoes = parseInt(insights.impressions || "0");
        const cliques = parseInt(insights.clicks || "0");

        // Anúncios desta campanha
        let anunciosCampanha = [];
        try {
          const adInsights = await getInsightsPorAnuncio(campanha.id, dias);
          const adInfo = await getAnunciosAtivos(campanha.id);
          const adInfoMap = {};
          for (const ad of adInfo) adInfoMap[ad.id] = ad;

          for (const ad of adInsights) {
            const adGasto = parseFloat(ad.spend || "0");
            const adLeads = extrairLeads(ad.actions);
            const adCpl = adLeads > 0 ? adGasto / adLeads : null;
            const adCtr = parseFloat(ad.ctr || "0");
            const adCpc = parseFloat(ad.cpc || "0");
            const info = adInfoMap[ad.ad_id] || {};
            const criativo = info.creative || {};

            const anuncio = {
              id: ad.ad_id,
              nome: ad.ad_name,
              campanhaId: campanha.id,
              campanhaNome: campanha.name,
              gasto: adGasto,
              leads: adLeads,
              cpl: adCpl,
              impressoes: parseInt(ad.impressions || "0"),
              cliques: parseInt(ad.clicks || "0"),
              ctr: adCtr,
              cpc: adCpc,
              status: info.effective_status || "UNKNOWN",
              thumbnail: criativo.thumbnail_url || null,
              titulo: criativo.title || null,
              corpo: criativo.body || null,
            };

            anunciosCampanha.push(anuncio);
            todosAnuncios.push(anuncio);
          }
        } catch (_) {}

        let status = cpl === null ? "sem_leads" : cpl > CPL_LIMITE ? "acima_limite" : "ok";

        if (status === "acima_limite" && !DRY_RUN && dias === 1) {
          try {
            const ok = await pausarCampanha(campanha.id);
            if (ok) { status = "pausada"; pausadas++; }
          } catch (_) {}
        }

        const sugestoes = gerarSugestoes({ gasto, leads, cpl, impressoes, cliques, status }, anunciosCampanha);

        resultados.push({ id: campanha.id, nome: campanha.name, status, gasto, leads, cpl, impressoes, cliques, sugestoes, anuncios: anunciosCampanha });
      } catch {
        resultados.push({ id: campanha.id, nome: campanha.name, status: "erro", gasto: 0, leads: 0, cpl: null, impressoes: 0, cliques: 0, sugestoes: [], anuncios: [] });
      }
    }

    const totalGasto = resultados.reduce((s, r) => s + r.gasto, 0);
    const totalLeads = resultados.reduce((s, r) => s + r.leads, 0);

    // Melhores criativos: anúncios com leads, ordenados por CPL
    const melhoresAnuncios = todosAnuncios
      .filter(a => a.leads > 0)
      .sort((a, b) => (a.cpl || Infinity) - (b.cpl || Infinity))
      .slice(0, 5);

    caches[dias] = {
      campanhas: resultados,
      anuncios: todosAnuncios,
      melhoresAnuncios,
      resumo: {
        total: resultados.length,
        ok: resultados.filter(r => r.status === "ok").length,
        acima: resultados.filter(r => r.status === "acima_limite").length,
        pausadas,
        cplLimite: CPL_LIMITE,
        totalGasto,
        totalLeads,
        cplMedio: totalLeads > 0 ? totalGasto / totalLeads : null,
      },
      atualizadoEm: new Date().toISOString(),
      periodo: dias,
      erro: null,
    };

    console.log(`[${new Date().toLocaleTimeString("pt-BR")}] OK ${dias}d — ${resultados.length} campanhas, ${todosAnuncios.length} anúncios`);
  } catch (err) {
    if (caches[dias]) caches[dias].erro = err?.response?.data?.error?.message || err.message;
    console.error(`[ERRO ${dias}d] ${err.message}`);
  }
}

async function sincronizarLeadsMeta() {
  try {
    const leads = await getLeadsMeta(7);
    if (!leads.length) return;

    const lista = lerCRM();
    const idsExistentes = new Set(lista.map(l => l.metaLeadId).filter(Boolean));
    const fonesExistentes = new Set(lista.map(l => l.fone).filter(Boolean));

    let novos = 0;
    for (const lead of leads) {
      if (idsExistentes.has(lead.metaLeadId)) continue;
      if (lead.fone && fonesExistentes.has(lead.fone)) continue;

      const entrada = {
        id:          Date.now() + Math.random(),
        metaLeadId:  lead.metaLeadId,
        nome:        lead.nome  || "Lead Meta Ads",
        empresa:     "",
        fone:        lead.fone  || "",
        email:       lead.email || "",
        valor:       "",
        fonte:       `Meta Ads — ${lead.campanhaNome || lead.adNome || ""}`.trim().replace(/—\s*$/, ""),
        etapa:       "novo",
        obs:         lead.adNome ? `Anúncio: ${lead.adNome}` : "",
        criadoEm:    lead.criadoEm || new Date().toISOString(),
      };

      lista.unshift(entrada);
      idsExistentes.add(lead.metaLeadId);
      if (lead.fone) fonesExistentes.add(lead.fone);
      novos++;
    }

    if (novos > 0) {
      salvarCRM(lista);
      console.log(`[Meta Leads] ✓ ${novos} novo(s) lead(s) importado(s) para o CRM`);
    }
  } catch (err) {
    console.error(`[Meta Leads] Erro ao sincronizar:`, err.message);
  }
}

async function coletarTodos() {
  await coletarDados(1);
  await coletarDados(7);
  await coletarDados(15);
  await sincronizarLeadsMeta();
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 horas
}));

function autenticado(req, res, next) {
  if (req.session && req.session.usuario) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "não autenticado" });
  res.redirect("/login");
}
function apenasAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(403).json({ error: "acesso restrito" });
}

// ── Login ──────────────────────────────────────────────
app.get("/login", (req, res) => {
  if (req.session.usuario) return res.redirect("/");
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Entrar — 2oumais Dashboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#f8fafc;min-height:100vh;display:flex;
    }
    /* Lado esquerdo — decorativo */
    .side{
      width:420px;flex-shrink:0;
      background:linear-gradient(145deg,#4f46e5 0%,#6366f1 40%,#8b5cf6 100%);
      display:flex;flex-direction:column;justify-content:center;padding:60px 48px;
      position:relative;overflow:hidden;
    }
    @media(max-width:700px){.side{display:none}}
    .side::before{
      content:'';position:absolute;width:400px;height:400px;border-radius:50%;
      background:rgba(255,255,255,.07);top:-100px;right:-100px;
    }
    .side::after{
      content:'';position:absolute;width:300px;height:300px;border-radius:50%;
      background:rgba(255,255,255,.05);bottom:-80px;left:-60px;
    }
    .side-mark{
      width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:14px;
      display:flex;align-items:center;justify-content:center;
      font-size:20px;font-weight:900;color:#fff;margin-bottom:36px;backdrop-filter:blur(10px);
    }
    .side h2{font-size:28px;font-weight:800;color:#fff;line-height:1.3;margin-bottom:12px;}
    .side p{font-size:14px;color:rgba(255,255,255,.7);line-height:1.7;}
    .side-features{margin-top:40px;display:flex;flex-direction:column;gap:14px;}
    .side-feat{display:flex;align-items:center;gap:12px;}
    .side-feat-icon{
      width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.15);
      display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;
    }
    .side-feat span{font-size:13px;color:rgba(255,255,255,.85);font-weight:500;}

    /* Lado direito — formulário */
    .main{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 24px;}
    .card{width:100%;max-width:380px;}
    .card-logo{display:flex;align-items:center;gap:10px;margin-bottom:36px;}
    .card-logo-mark{
      width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
      border-radius:10px;display:flex;align-items:center;justify-content:center;
      font-size:16px;font-weight:900;color:#fff;
    }
    .card-logo h1{font-size:18px;font-weight:800;color:#0f172a;}
    .card-logo h1 span{color:#6366f1;}
    .card h2{font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px;}
    .card-sub{font-size:14px;color:#94a3b8;margin-bottom:28px;}

    label{
      display:block;font-size:11px;font-weight:700;color:#64748b;
      text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;
    }
    .input-wrap{position:relative;margin-bottom:18px;}
    input{
      width:100%;padding:12px 16px;background:#fff;
      border:1.5px solid #e2e8f0;border-radius:10px;
      color:#0f172a;font-size:14px;outline:none;
      transition:all .2s;font-family:inherit;
      box-shadow:0 1px 2px rgba(0,0,0,.04);
    }
    input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12);}
    button{
      width:100%;padding:13px;
      background:linear-gradient(135deg,#6366f1,#4f46e5);
      color:#fff;border:none;border-radius:10px;
      font-size:14px;font-weight:700;cursor:pointer;
      transition:all .2s;font-family:inherit;
      box-shadow:0 4px 14px rgba(99,102,241,.35);
      letter-spacing:.2px;
    }
    button:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,.45);}
    button:active{transform:translateY(0);}
    .erro{
      background:#fef2f2;color:#dc2626;border:1px solid #fecaca;
      border-radius:10px;padding:11px 14px;font-size:13px;
      margin-bottom:18px;display:flex;align-items:center;gap:8px;font-weight:500;
    }
    .footer{margin-top:24px;text-align:center;font-size:12px;color:#cbd5e1;}
  </style>
</head>
<body>
  <div class="side">
    <div class="side-mark">2+</div>
    <h2>Gerencie suas campanhas com inteligência</h2>
    <p>Painel completo para monitorar, otimizar e fechar negócios.</p>
    <div class="side-features">
      <div class="side-feat">
        <div class="side-feat-icon">📊</div>
        <span>Campanhas Meta Ads em tempo real</span>
      </div>
      <div class="side-feat">
        <div class="side-feat-icon">⚡</div>
        <span>Pausa automática por CPL</span>
      </div>
      <div class="side-feat">
        <div class="side-feat-icon">📄</div>
        <span>Gerador de contratos em PDF e Word</span>
      </div>
      <div class="side-feat">
        <div class="side-feat-icon">🔻</div>
        <span>Funil de vendas completo</span>
      </div>
    </div>
  </div>
  <div class="main">
    <div class="card">
      <div class="card-logo">
        <div class="card-logo-mark">2+</div>
        <h1>2ou<span>mais</span></h1>
      </div>
      <h2>Bem-vindo de volta</h2>
      <p class="card-sub">Acesse seu dashboard de campanhas</p>
      ${req.query.erro ? '<div class="erro">⚠️ Usuário ou senha incorretos</div>' : ''}
      <form method="POST" action="/login">
        <label>Usuário</label>
        <div class="input-wrap">
          <input type="text" name="usuario" placeholder="seu usuário" autocomplete="username" required/>
        </div>
        <label>Senha</label>
        <div class="input-wrap">
          <input type="password" name="senha" placeholder="••••••••" autocomplete="current-password" required/>
        </div>
        <button type="submit">Entrar no Dashboard →</button>
      </form>
      <div class="footer">2oumais Marketing Digital</div>
    </div>
  </div>
</body>
</html>`);
});

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body || {};
  const users = lerUsuarios();
  const user = users.find(u => u.usuario === usuario && u.senhaHash === hashSenha(senha));
  if (user) {
    req.session.usuario = user.usuario;
    req.session.nome    = user.nome;
    req.session.views   = user.views || ALL_VIEWS;
    req.session.admin   = user.admin === true;
    res.redirect("/");
  } else {
    res.redirect("/login?erro=1");
  }
});

// ── Gerenciar usuários (admin) ─────────────────────────────
app.get("/api/usuarios", autenticado, apenasAdmin, (req, res) => {
  res.json(lerUsuarios().map(u => ({ usuario: u.usuario, nome: u.nome, views: u.views, admin: u.admin || false })));
});

app.post("/api/usuarios", autenticado, apenasAdmin, (req, res) => {
  const lista = lerUsuarios();
  const { usuario, nome, senha, views, admin } = req.body;
  if (!usuario || !nome || !senha) return res.status(400).json({ error: "usuario, nome e senha são obrigatórios" });
  if (lista.find(u => u.usuario === usuario)) return res.status(400).json({ error: "usuário já existe" });
  const novo = { usuario, nome, senhaHash: hashSenha(senha), views: views || ALL_VIEWS, admin: admin || false };
  lista.push(novo);
  salvarUsuarios(lista);
  res.json({ usuario: novo.usuario, nome: novo.nome, views: novo.views, admin: novo.admin });
});

app.patch("/api/usuarios/:usuario", autenticado, apenasAdmin, (req, res) => {
  const lista = lerUsuarios();
  const idx = lista.findIndex(u => u.usuario === req.params.usuario);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  const { nome, senha, views, admin } = req.body;
  if (nome)   lista[idx].nome  = nome;
  if (senha)  lista[idx].senhaHash = hashSenha(senha);
  if (views)  lista[idx].views = views;
  if (admin !== undefined) lista[idx].admin = admin;
  salvarUsuarios(lista);
  res.json({ usuario: lista[idx].usuario, nome: lista[idx].nome, views: lista[idx].views, admin: lista[idx].admin });
});

app.delete("/api/usuarios/:usuario", autenticado, apenasAdmin, (req, res) => {
  if (req.params.usuario === req.session.usuario) return res.status(400).json({ error: "não pode excluir a si mesmo" });
  salvarUsuarios(lerUsuarios().filter(u => u.usuario !== req.params.usuario));
  res.json({ ok: true });
});

app.get("/api/me", autenticado, (req, res) => {
  res.json({
    usuario: req.session.usuario,
    nome:    req.session.nome,
    views:   req.session.views,
    admin:   req.session.admin || false,
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/api/conversoes", autenticado, (_req, res) => res.json(lerConversoes()));

app.post("/api/conversoes", autenticado, (req, res) => {
  const { dias, reunioes, vendas, receita } = req.body;
  const data = lerConversoes();
  data[String(dias)] = {
    reunioes: parseInt(reunioes) || 0,
    vendas: parseInt(vendas) || 0,
    receita: parseFloat(receita) || 0,
  };
  salvarConversoes(data);
  res.json({ ok: true });
});

app.get("/", autenticado, (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

app.get("/api/campanhas", autenticado, (req, res) => {
  const dias = parseInt(req.query.dias) || 1;
  const cache = caches[dias];
  if (!cache) return res.status(503).json({ error: "Aguardando coleta..." });
  if (cache.erro) return res.status(500).json({ error: cache.erro });
  res.json(cache);
});

// Contratos — geração
function registrarContrato(dados) {
  try {
    const lista = lerContratos();
    const { status, diasRestantes, dataFim } = calcularStatus(dados.dataInicio, dados.duracao);
    // Evita duplicatas: mesmo cliente + mesma data início
    const existe = lista.findIndex(c => c.empresaNome === dados.empresaNome && c.dataInicio === dados.dataInicio);
    const entrada = {
      id: existe >= 0 ? lista[existe].id : Date.now(),
      empresaNome:       dados.empresaNome || "—",
      representante:     dados.representanteNome || "—",
      plano:             dados.plano || "—",
      valorMensal:       dados.valorMensal || "—",
      dataInicio:        dados.dataInicio,
      duracaoMeses:      parseInt(dados.duracao) || 6,
      dataFim,
      status,
      diasRestantes,
      criadoEm:          existe >= 0 ? lista[existe].criadoEm : new Date().toISOString(),
    };
    if (existe >= 0) lista[existe] = entrada; else lista.unshift(entrada);
    salvarContratos(lista);
  } catch (e) { console.error("[REGISTRAR CONTRATO]", e.message); }
}

app.post("/api/contrato/registrar", autenticado, (req, res) => {
  try {
    registrarContrato(req.body);
    const lista = lerContratos();
    res.json(lista[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/contrato/docx", autenticado, async (req, res) => {
  try {
    const buffer = await gerarDocx(req.body);
    registrarContrato(req.body);
    const nome = (req.body.empresaNome || "contrato").replace(/[^a-z0-9]/gi, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="contrato_${nome}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error("[CONTRATO DOCX]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/contrato/pdf", autenticado, async (req, res) => {
  try {
    const buffer = await gerarPDF(req.body);
    registrarContrato(req.body);
    const nome = (req.body.empresaNome || "contrato").replace(/[^a-z0-9]/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="contrato_${nome}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error("[CONTRATO PDF]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Contratos — gestão
app.get("/api/contratos", autenticado, (_req, res) => {
  const lista = lerContratos().map(c => ({
    ...c,
    ...calcularStatus(c.dataInicio, c.duracaoMeses),
  }));
  res.json(lista);
});

app.delete("/api/contratos/:id", autenticado, (req, res) => {
  const lista = lerContratos().filter(c => String(c.id) !== req.params.id);
  salvarContratos(lista);
  res.json({ ok: true });
});

app.patch("/api/contratos/:id", autenticado, (req, res) => {
  const lista = lerContratos();
  const idx = lista.findIndex(c => String(c.id) === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  const { dataInicio, duracaoMeses, valorMensal, permuta, valorEfetivo, excluirReceita, servico, dataFim } = req.body;
  if (dataInicio)                   lista[idx].dataInicio     = dataInicio;
  if (duracaoMeses)                 lista[idx].duracaoMeses   = parseInt(duracaoMeses);
  if (valorMensal)                  lista[idx].valorMensal    = valorMensal;
  if (permuta !== undefined)        lista[idx].permuta        = permuta;
  if (valorEfetivo !== undefined)   lista[idx].valorEfetivo   = valorEfetivo;
  if (excluirReceita !== undefined) lista[idx].excluirReceita = excluirReceita;
  if (servico !== undefined)        lista[idx].servico        = servico;
  if (dataFim !== undefined)        lista[idx].dataFim        = dataFim;
  if (req.body.diaPagamento !== undefined) lista[idx].diaPagamento = req.body.diaPagamento;
  const calc = calcularStatus(lista[idx].dataInicio, lista[idx].duracaoMeses);
  lista[idx] = { ...lista[idx], ...calc };
  salvarContratos(lista);
  res.json(lista[idx]);
});

app.patch("/api/contratos/:id/renovar", autenticado, (req, res) => {
  const lista = lerContratos();
  const c = lista.find(c => String(c.id) === req.params.id);
  if (!c) return res.status(404).json({ error: "não encontrado" });
  // Renova a partir do dia de hoje
  const hoje = new Date().toISOString().split("T")[0];
  c.dataInicio = hoje;
  const calc = calcularStatus(hoje, c.duracaoMeses);
  c.dataFim = calc.dataFim;
  c.status = calc.status;
  c.diasRestantes = calc.diasRestantes;
  salvarContratos(lista);
  res.json(c);
});

// Template personalizado
app.get("/api/template", autenticado, (_req, res) => {
  try {
    if (fs.existsSync(TEMPLATE_FILE)) {
      const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
      return res.json({ template });
    }
  } catch {}
  res.json({ template: "" });
});

app.post("/api/template", autenticado, (req, res) => {
  const { template } = req.body;
  fs.mkdirSync(path.dirname(TEMPLATE_FILE), { recursive: true });
  if (template) {
    fs.writeFileSync(TEMPLATE_FILE, template, "utf8");
  } else if (fs.existsSync(TEMPLATE_FILE)) {
    fs.unlinkSync(TEMPLATE_FILE);
  }
  res.json({ ok: true });
});

// ── CRM ───────────────────────────────────────────────
// rotas fixas ANTES das rotas com :id
app.get("/api/crm/config", autenticado, (_req, res) => res.json(lerCRMConfig()));
app.post("/api/crm/config", autenticado, (req, res) => {
  fs.mkdirSync(path.dirname(CRM_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CRM_CONFIG_FILE, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

app.post("/api/crm/sync-meta", autenticado, async (_req, res) => {
  try {
    await sincronizarLeadsMeta();
    res.json({ ok: true, crm: lerCRM() });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Importar lista CSV/XLS para o CRM
const multer = require("multer");
const XLSX = require("xlsx");
const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/crm/importar", autenticado, upload.single("arquivo"), (req, res) => {
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const lista = lerCRM();
    const fonesExistentes = new Set(lista.map(l => l.fone).filter(Boolean));
    let novos = 0;

    for (const row of rows) {
      const nome  = String(row["Nome da Clínica"] || row["Nome da clinica"] || row.nome || row.Nome || row.NOME || row.name || row.empresa || row.Empresa || "").trim();
      const fone  = String(row.Telefone || row.telefone || row.fone || row.Fone || row.FONE || row.phone || row.whats || row.celular || "").replace(/\D/g, "").trim();
      const email = String(row.email || row.Email || row.EMAIL || "").trim();
      const empresa = String(row["Nome da Clínica"] || row["Nome da clinica"] || row.empresa || row.Empresa || row.EMPRESA || "").trim();

      if (!fone) continue;
      if (fonesExistentes.has(fone)) continue;

      const site = String(row.Site || row.site || row.website || "").trim();
      const endereco = String(row["Endereço"] || row.endereco || row.Endereço || "").trim();
      const avaliacao = String(row["Avaliação"] || row.avaliacao || "").trim();
      const obs = [site && `Site: ${site}`, endereco && `Endereço: ${endereco}`, avaliacao && `Avaliação: ${avaliacao}`].filter(Boolean).join(" | ");
      lista.unshift({ id: Date.now() + novos, nome: nome || fone, empresa, fone, email, valor: "", fonte: "Importação", etapa: "novo", obs, criadoEm: new Date().toISOString() });
      fonesExistentes.add(fone);
      novos++;
    }

    salvarCRM(lista);
    res.json({ ok: true, novos, total: lista.length });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/api/crm", autenticado, (_req, res) => res.json(lerCRM()));

app.post("/api/crm", autenticado, (req, res) => {
  const lista = lerCRM();
  const lead = {
    id: Date.now(),
    nome:      req.body.nome      || "",
    empresa:   req.body.empresa   || "",
    fone:      req.body.fone      || "",
    email:     req.body.email     || "",
    valor:     req.body.valor     || "",
    fonte:     req.body.fonte     || "",
    etapa:     req.body.etapa     || "novo",
    obs:       req.body.obs       || "",
    criadoEm:  new Date().toISOString(),
  };
  lista.unshift(lead);
  salvarCRM(lista);
  res.json(lead);
});

app.patch("/api/crm/:id", autenticado, (req, res) => {
  const lista = lerCRM();
  const idx = lista.findIndex(l => String(l.id) === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  lista[idx] = { ...lista[idx], ...req.body, id: lista[idx].id, criadoEm: lista[idx].criadoEm };
  salvarCRM(lista);
  res.json(lista[idx]);
});

app.delete("/api/crm/:id", autenticado, (req, res) => {
  salvarCRM(lerCRM().filter(l => String(l.id) !== req.params.id));
  res.json({ ok: true });
});

// ── Google Ads ────────────────────────────────────────────────────────────────
app.get("/api/google/campanhas", autenticado, async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 7;
    console.log(`[Google Ads] Buscando dados ${dias}d...`);
    const [campanhas, keywords] = await Promise.all([
      getCampanhasGoogle(dias),
      getKeywordsGoogle(dias),
    ]);
    console.log(`[Google Ads] OK — ${campanhas.length} campanhas, ${keywords.length} keywords`);
    res.json({ campanhas, keywords });
  } catch (err) {
    console.error(`[Google Ads] ERRO:`, err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ── WhatsApp (Baileys — local) ────────────────────────────────────────────────
const whatsapp = require("./whatsapp");

app.get("/api/whatsapp/status", autenticado, (_req, res) => {
  res.json(whatsapp.getStatus());
});

app.post("/api/whatsapp/conectar", autenticado, async (_req, res) => {
  try {
    await whatsapp.iniciarWhatsApp();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/api/whatsapp/desconectar", autenticado, async (_req, res) => {
  try {
    await whatsapp.desconectar();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/api/chat/:fone", autenticado, (_req, res) => {
  const zapi = require("./zapi");
  const chats = zapi.lerChats();
  res.json(chats[_req.params.fone] || []);
});

app.post("/api/chat/:fone", autenticado, async (req, res) => {
  try {
    await whatsapp.enviarMensagem(req.params.fone, req.body.texto);
    // enviarMensagem já pausa o bot automaticamente
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/api/chat/:fone/bot-status", autenticado, (req, res) => {
  res.json({ pausado: whatsapp.botPausado(req.params.fone) });
});

app.post("/api/chat/:fone/reativar-bot", autenticado, (req, res) => {
  whatsapp.reativarBot(req.params.fone);
  res.json({ ok: true });
});

app.post("/api/chat/:fone/pausar-bot", autenticado, (req, res) => {
  whatsapp.pausarBot(req.params.fone);
  res.json({ ok: true });
});

// ── Z-API (cloud WhatsApp) ────────────────────────────────────────────────────
const zapi = require("./zapi");

// Webhook — Z-API chama esta rota quando chega mensagem
app.post("/api/zapi/webhook", async (req, res) => {
  res.sendStatus(200); // responde rápido para Z-API não retentar
  try {
    await zapi.processarWebhook(req.body);
  } catch (e) {
    console.error("[ZAPI webhook]", e.message);
  }
});

// Liga/desliga bot globalmente
app.post("/api/bot/desativar", autenticado, (_req, res) => {
  zapi.desativarBotGlobal();
  res.json({ ok: true, status: "desativado" });
});
app.post("/api/bot/ativar", autenticado, (_req, res) => {
  zapi.ativarBotGlobal();
  res.json({ ok: true, status: "ativo" });
});
app.get("/api/bot/status-global", autenticado, (_req, res) => {
  res.json({ ativo: !zapi.botGlobalOff() });
});

// Status e QR Code da instância Z-API
app.get("/api/zapi/status", autenticado, async (_req, res) => {
  res.json(await zapi.getStatus());
});

app.get("/api/zapi/qrcode", autenticado, async (_req, res) => {
  const qr = await zapi.getQRCode();
  res.json({ qr });
});

app.get("/api/funil/config", autenticado, (_req, res) => res.json(lerFunilConfig()));
app.post("/api/funil/config", autenticado, (req, res) => {
  fs.mkdirSync(path.dirname(FUNIL_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(FUNIL_CONFIG_FILE, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

// ── Zapier Lead Webhook ───────────────────────────────────────────────────────
function gerarMensagemBoasVindas(nome) {
  const primeiroNome = (nome || "").split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}! 👋` : `Olá! 👋`;
  return `${saudacao} Aqui é da *2oumais Marketing Digital*!\n\nVi que você demonstrou interesse nos nossos serviços. Fico feliz em te atender! 😊\n\nMe conta: qual é o seu negócio e qual seu maior desafio com marketing hoje?`;
}

app.post("/api/zapier/lead", async (req, res) => {
  res.sendStatus(200);
  try {
    const { nome, fone, whats, email } = req.body;
    const telefone = (whats || fone || "").replace(/\D/g, "");

    // Adiciona ao CRM
    const lista = lerCRM();
    const jaExiste = lista.some(l => l.fone === telefone);
    if (!jaExiste && telefone) {
      const lead = {
        id: Date.now(),
        nome: nome || "Lead Meta Ads",
        empresa: "",
        fone: telefone,
        email: email || "",
        valor: "",
        fonte: "Meta Ads — Formulário",
        etapa: "novo",
        obs: req.body.anuncio ? `Anúncio: ${req.body.anuncio}` : "",
        criadoEm: new Date().toISOString(),
      };
      lista.unshift(lead);
      salvarCRM(lista);
      console.log(`[Zapier] ✓ Novo lead: ${lead.nome} (${telefone})`);

      // Envia mensagem de boas-vindas via Baileys
      if (telefone) {
        try {
          await whatsapp.enviarMensagem(telefone, gerarMensagemBoasVindas(nome));
          console.log(`[Zapier] ✓ Mensagem enviada para ${telefone}`);
        } catch (e) {
          console.error(`[Zapier] Erro ao enviar mensagem:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error("[Zapier webhook]", e.message);
  }
});

// ── Prospecção ────────────────────────────────────────────────────────────────
app.post("/api/prospeccao/enviar", autenticado, async (req, res) => {
  try {
    const { fone, mensagem } = req.body;
    if (!fone || !mensagem) return res.status(400).json({ erro: "fone e mensagem obrigatórios" });
    await zapi.enviarMensagem(fone, mensagem);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// ── Agenda ────────────────────────────────────────────────────────────────────
app.get("/api/agenda", autenticado, (_req, res) => res.json(lerAgenda()));

app.post("/api/agenda", autenticado, (req, res) => {
  const lista = lerAgenda();
  const item = {
    id: Date.now(),
    leadNome:  req.body.leadNome  || "",
    leadFone:  req.body.leadFone  || "",
    leadId:    req.body.leadId    || null,
    tipo:      req.body.tipo      || "ligacao",
    data:      req.body.data      || "",
    hora:      req.body.hora      || "",
    obs:       req.body.obs       || "",
    status:    "pendente",
    criadoEm:  new Date().toISOString(),
  };
  lista.unshift(item);
  salvarAgenda(lista);
  res.json(item);
});

app.patch("/api/agenda/:id", autenticado, (req, res) => {
  const lista = lerAgenda();
  const idx = lista.findIndex(i => String(i.id) === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  lista[idx] = { ...lista[idx], ...req.body, id: lista[idx].id };
  salvarAgenda(lista);
  res.json(lista[idx]);
});

app.delete("/api/agenda/:id", autenticado, (req, res) => {
  salvarAgenda(lerAgenda().filter(i => String(i.id) !== req.params.id));
  res.json({ ok: true });
});

// ── OPERAÇÕES ──────────────────────────────────────────────
function lerOperacoesColunas() {
  try { if (fs.existsSync(OPERACOES_COLUNAS_FILE)) return JSON.parse(fs.readFileSync(OPERACOES_COLUNAS_FILE, "utf8")); } catch {}
  return DEFAULT_OPERACOES_COLUNAS;
}
function salvarOperacoesColunas(lista) {
  fs.mkdirSync(path.dirname(OPERACOES_COLUNAS_FILE), { recursive: true });
  fs.writeFileSync(OPERACOES_COLUNAS_FILE, JSON.stringify(lista, null, 2));
}

app.get("/api/operacoes-colunas", autenticado, (_req, res) => res.json(lerOperacoesColunas()));
app.post("/api/operacoes-colunas", autenticado, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "esperado array" });
  salvarOperacoesColunas(req.body);
  res.json({ ok: true });
});

function lerOperacoes() {
  try { if (fs.existsSync(OPERACOES_FILE)) return JSON.parse(fs.readFileSync(OPERACOES_FILE, "utf8")); } catch {}
  return [];
}
function salvarOperacoes(lista) {
  fs.mkdirSync(path.dirname(OPERACOES_FILE), { recursive: true });
  fs.writeFileSync(OPERACOES_FILE, JSON.stringify(lista, null, 2));
}

app.get("/api/operacoes", autenticado, (req, res) => {
  res.json(lerOperacoes());
});

app.post("/api/operacoes", autenticado, (req, res) => {
  const lista = lerOperacoes();
  const item = {
    id:          Date.now(),
    contratoId:  req.body.contratoId  || null,
    empresaNome: req.body.empresaNome || "",
    cnpj:        req.body.cnpj        || "",
    ferramentas: req.body.ferramentas || [],
    verba:       req.body.verba       || "",
    prazo:       req.body.prazo       || "",
    equipe:      req.body.equipe      || "felipe",
    etapa:       req.body.etapa       || "onboarding",
    obs:         req.body.obs         || "",
    criadoEm:    new Date().toISOString(),
  };
  lista.push(item);
  salvarOperacoes(lista);
  res.json(item);
});

app.patch("/api/operacoes/:id", autenticado, (req, res) => {
  const lista = lerOperacoes();
  const idx = lista.findIndex(i => String(i.id) === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  lista[idx] = { ...lista[idx], ...req.body, id: lista[idx].id };
  salvarOperacoes(lista);
  res.json(lista[idx]);
});

app.delete("/api/operacoes/:id", autenticado, (req, res) => {
  salvarOperacoes(lerOperacoes().filter(i => String(i.id) !== req.params.id));
  res.json({ ok: true });
});

// ── FINANCEIRO ─────────────────────────────────────────────
function lerFinanceiro() {
  try { if (fs.existsSync(FINANCEIRO_FILE)) return JSON.parse(fs.readFileSync(FINANCEIRO_FILE, "utf8")); } catch {}
  return [];
}
function salvarFinanceiro(lista) {
  fs.mkdirSync(path.dirname(FINANCEIRO_FILE), { recursive: true });
  fs.writeFileSync(FINANCEIRO_FILE, JSON.stringify(lista, null, 2));
}

app.get("/api/financeiro", autenticado, (req, res) => {
  const { mes } = req.query;
  let lista = lerFinanceiro();
  if (mes) lista = lista.filter(i => i.mes === mes);
  res.json(lista);
});

app.post("/api/financeiro", autenticado, (req, res) => {
  const lista = lerFinanceiro();
  const item = {
    id:        Date.now(),
    mes:       req.body.mes       || "",
    tipo:      req.body.tipo      || "despesa",
    categoria: req.body.categoria || "outras",
    descricao: req.body.descricao || "",
    valor:     parseFloat(req.body.valor) || 0,
    criadoEm:  new Date().toISOString(),
  };
  lista.push(item);
  salvarFinanceiro(lista);
  res.json(item);
});

app.patch("/api/financeiro/:id", autenticado, (req, res) => {
  const lista = lerFinanceiro();
  const idx = lista.findIndex(i => String(i.id) === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  if (req.body.valor !== undefined) req.body.valor = parseFloat(req.body.valor) || 0;
  lista[idx] = { ...lista[idx], ...req.body, id: lista[idx].id };
  salvarFinanceiro(lista);
  res.json(lista[idx]);
});

app.delete("/api/financeiro/:id", autenticado, (req, res) => {
  salvarFinanceiro(lerFinanceiro().filter(i => String(i.id) !== req.params.id));
  res.json({ ok: true });
});

// ── PAGAMENTOS ─────────────────────────────────────────────
function lerPagamentos() {
  try { if (fs.existsSync(PAGAMENTOS_FILE)) return JSON.parse(fs.readFileSync(PAGAMENTOS_FILE, "utf8")); } catch {}
  return [];
}
function salvarPagamentos(lista) {
  fs.mkdirSync(path.dirname(PAGAMENTOS_FILE), { recursive: true });
  fs.writeFileSync(PAGAMENTOS_FILE, JSON.stringify(lista, null, 2));
}

app.get("/api/pagamentos", autenticado, (req, res) => {
  const { mes } = req.query;
  let lista = lerPagamentos();
  if (mes) lista = lista.filter(p => p.mes === mes);
  res.json(lista);
});

app.post("/api/pagamentos", autenticado, (req, res) => {
  const lista = lerPagamentos();
  const { contratoId, mes } = req.body;
  const existe = lista.findIndex(p => String(p.contratoId) === String(contratoId) && p.mes === mes);
  if (existe >= 0) return res.json(lista[existe]);
  const item = { id: Date.now(), contratoId: Number(contratoId), mes, pagoEm: new Date().toISOString() };
  lista.push(item);
  salvarPagamentos(lista);
  res.json(item);
});

app.delete("/api/pagamentos/:contratoId/:mes", autenticado, (req, res) => {
  salvarPagamentos(lerPagamentos().filter(p =>
    !(String(p.contratoId) === req.params.contratoId && p.mes === req.params.mes)
  ));
  res.json({ ok: true });
});

// ── Tráfego Pago ───────────────────────────────────────────
const TRAFEGO_FILE = path.join(DATA_DIR, "trafego.json");
function lerTrafego() {
  try { if (fs.existsSync(TRAFEGO_FILE)) return JSON.parse(fs.readFileSync(TRAFEGO_FILE, "utf8")); } catch {}
  return [];
}
function salvarTrafego(lista) {
  fs.mkdirSync(path.dirname(TRAFEGO_FILE), { recursive: true });
  fs.writeFileSync(TRAFEGO_FILE, JSON.stringify(lista, null, 2));
}

app.get("/api/trafego", autenticado, (_req, res) => res.json(lerTrafego()));

app.post("/api/trafego", autenticado, (req, res) => {
  const lista = lerTrafego();
  const nova = { id: Date.now(), ...req.body, criadoEm: new Date().toISOString() };
  lista.push(nova);
  salvarTrafego(lista);
  res.json(nova);
});

app.patch("/api/trafego/:id", autenticado, (req, res) => {
  const lista = lerTrafego();
  const idx = lista.findIndex(c => String(c.id) === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "não encontrado" });
  Object.assign(lista[idx], req.body);
  salvarTrafego(lista);
  res.json(lista[idx]);
});

app.delete("/api/trafego/:id", autenticado, (req, res) => {
  salvarTrafego(lerTrafego().filter(c => String(c.id) !== req.params.id));
  res.json({ ok: true });
});

app.listen(PORT, async () => {
  console.log(`\nDashboard: http://localhost:${PORT}\n`);
  await coletarTodos();
  setInterval(coletarTodos, INTERVALO_MS);
});
