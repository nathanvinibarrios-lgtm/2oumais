require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const {
  getCampanhasAtivas,
  getInsightsCampanha,
  extrairLeads,
  pausarCampanha,
} = require("./metaClient");

const CPL_LIMITE = parseFloat(process.env.CPL_LIMITE || "50");

// ── Busca resumo de todas as campanhas ativas ─────────────────────────────────
async function buscarCampanhas() {
  const campanhas = await getCampanhasAtivas();
  if (campanhas.length === 0) return "Nenhuma campanha ativa no momento.";

  const resultados = [];

  for (const campanha of campanhas) {
    try {
      const insights = await getInsightsCampanha(campanha.id);
      if (!insights) {
        resultados.push({ nome: campanha.name, gasto: 0, leads: 0, cpl: null, status: "sem_dados" });
        continue;
      }

      const gasto = parseFloat(insights.spend || "0");
      const leads = extrairLeads(insights.actions);
      const cpl = leads > 0 ? gasto / leads : null;
      const status = cpl === null ? "sem_leads" : cpl > CPL_LIMITE ? "acima_limite" : "ok";

      resultados.push({ nome: campanha.name, gasto, leads, cpl, status });
    } catch {
      resultados.push({ nome: campanha.name, gasto: 0, leads: 0, cpl: null, status: "erro" });
    }
  }

  return resultados;
}

// ── Pausa uma campanha pelo nome (busca parcial) ──────────────────────────────
async function pausarCampanhaPorNome(nomeParcial) {
  const campanhas = await getCampanhasAtivas();
  const encontrada = campanhas.find(c =>
    c.name.toLowerCase().includes(nomeParcial.toLowerCase())
  );

  if (!encontrada) return `Nenhuma campanha ativa encontrada com o nome "${nomeParcial}".`;

  const sucesso = await pausarCampanha(encontrada.id);
  return sucesso
    ? `Campanha "${encontrada.name}" pausada com sucesso.`
    : `Falha ao pausar a campanha "${encontrada.name}".`;
}

// ── Formata os dados de campanhas para o Claude ───────────────────────────────
function formatarCampanhasParaPrompt(resultados) {
  if (typeof resultados === "string") return resultados;

  const linhas = resultados.map(c => {
    const gasto = `R$ ${c.gasto.toFixed(2)}`;
    const leads = c.leads;
    const cpl = c.cpl !== null ? `R$ ${c.cpl.toFixed(2)}` : "N/A";
    const status = {
      ok: "✓ OK",
      acima_limite: "⚠ Acima do limite",
      sem_leads: "Sem leads",
      sem_dados: "Sem dados",
      erro: "Erro",
    }[c.status] || c.status;

    return `• ${c.nome}\n  Gasto: ${gasto} | Leads: ${leads} | CPL: ${cpl} | ${status}`;
  });

  const totalGasto = resultados.reduce((s, c) => s + c.gasto, 0);
  const totalLeads = resultados.reduce((s, c) => s + c.leads, 0);
  const acima = resultados.filter(c => c.status === "acima_limite").length;

  return [
    `📊 *${resultados.length} campanhas ativas* (últimas 24h)`,
    `💰 Gasto total: R$ ${totalGasto.toFixed(2)} | Leads: ${totalLeads} | CPL limite: R$ ${CPL_LIMITE}`,
    acima > 0 ? `⚠ ${acima} campanha(s) acima do limite de CPL` : "✓ Todas dentro do limite",
    "",
    ...linhas,
  ].join("\n");
}

module.exports = { buscarCampanhas, pausarCampanhaPorNome, formatarCampanhasParaPrompt };
