require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const { gerarDocx, gerarPDF } = require("./contrato");

const CONVERSOES_FILE  = path.join(__dirname, "../data/conversoes.json");
const CONTRATOS_FILE   = path.join(__dirname, "../data/contratos.json");
const TEMPLATE_FILE    = path.join(__dirname, "../data/template-contrato.txt");
const CRM_FILE         = path.join(__dirname, "../data/crm.json");
const CRM_CONFIG_FILE  = path.join(__dirname, "../data/crm-config.json");
const FUNIL_CONFIG_FILE= path.join(__dirname, "../data/funil-config.json");
const AGENDA_FILE      = path.join(__dirname, "../data/agenda.json");

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
const LOGIN_USER = process.env.LOGIN_USER || "admin";
const LOGIN_PASS = process.env.LOGIN_PASS || "admin";
const SESSION_SECRET = process.env.SESSION_SECRET || "secret_padrao_troque";

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
  if (req.session && req.session.logado) return next();
  res.redirect("/login");
}

// ── Login ──────────────────────────────────────────────
app.get("/login", (req, res) => {
  if (req.session.logado) return res.redirect("/");
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
  if (usuario === LOGIN_USER && senha === LOGIN_PASS) {
    req.session.logado = true;
    res.redirect("/");
  } else {
    res.redirect("/login?erro=1");
  }
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
  const { dataInicio, duracaoMeses, valorMensal } = req.body;
  if (dataInicio)   lista[idx].dataInicio   = dataInicio;
  if (duracaoMeses) lista[idx].duracaoMeses = parseInt(duracaoMeses);
  if (valorMensal)  lista[idx].valorMensal  = valorMensal;
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
    const zapi = require("./zapi");
    await zapi.enviarMensagem(req.params.fone, req.body.texto);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
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

app.listen(PORT, async () => {
  console.log(`\nDashboard: http://localhost:${PORT}\n`);
  await coletarTodos();
  setInterval(coletarTodos, INTERVALO_MS);
});
