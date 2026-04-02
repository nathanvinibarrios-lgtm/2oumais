const {
  getCampanhasAtivas,
  getInsightsCampanha,
  pausarCampanha,
  extrairLeads,
} = require("./metaClient");

const CPL_LIMITE = parseFloat(process.env.CPL_LIMITE || "50");
const DRY_RUN = process.env.DRY_RUN === "true";

/**
 * Executa o ciclo completo do agente:
 * 1. Busca campanhas ativas
 * 2. Verifica CPL de cada uma nas últimas 24h
 * 3. Pausa automaticamente as que estão acima do limite
 */
async function executarAgente() {
  const inicio = new Date();
  log("=".repeat(60));
  log(`Agente iniciado em ${inicio.toLocaleString("pt-BR")}`);
  log(`CPL limite: R$ ${CPL_LIMITE.toFixed(2)}`);
  if (DRY_RUN) log("MODO DRY RUN ativado — nenhuma campanha será pausada de verdade");
  log("=".repeat(60));

  // 1. Buscar campanhas ativas
  log("\n[1/3] Buscando campanhas ativas...");
  const campanhas = await getCampanhasAtivas();
  log(`→ ${campanhas.length} campanha(s) ativa(s) encontrada(s)`);

  if (campanhas.length === 0) {
    log("Nenhuma campanha ativa. Encerrando.");
    return resumo(0, 0, 0);
  }

  // 2. Analisar CPL de cada campanha
  log("\n[2/3] Analisando CPL das campanhas nas últimas 24h...\n");

  const resultados = [];

  for (const campanha of campanhas) {
    try {
      const insights = await getInsightsCampanha(campanha.id);

      if (!insights) {
        log(`  [SEM DADOS] ${campanha.name} (${campanha.id}) — sem dados nas últimas 24h`);
        resultados.push({ campanha, status: "sem_dados", cpl: null });
        continue;
      }

      const gasto = parseFloat(insights.spend || "0");
      const leads = extrairLeads(insights.actions);
      const cpl = leads > 0 ? gasto / leads : null;

      const cplTexto = cpl !== null ? `R$ ${cpl.toFixed(2)}` : "N/A (sem leads)";
      const gastosTexto = `R$ ${gasto.toFixed(2)}`;

      if (cpl === null) {
        log(`  [SEM LEADS] ${campanha.name} | Gasto: ${gastosTexto} | Leads: 0 | CPL: ${cplTexto}`);
        resultados.push({ campanha, status: "sem_leads", cpl: null, gasto, leads: 0 });
        continue;
      }

      const acimaDolimite = cpl > CPL_LIMITE;
      const indicador = acimaDolimite ? "⚠ ACIMA" : "✓ OK";

      log(
        `  [${indicador}] ${campanha.name} | Gasto: ${gastosTexto} | Leads: ${leads} | CPL: ${cplTexto}`
      );

      resultados.push({
        campanha,
        status: acimaDolimite ? "acima_limite" : "ok",
        cpl,
        gasto,
        leads,
      });
    } catch (err) {
      const mensagem = extrairMensagemErro(err);
      log(`  [ERRO] ${campanha.name} (${campanha.id}) — ${mensagem}`);
      resultados.push({ campanha, status: "erro", cpl: null, erro: mensagem });
    }
  }

  // 3. Pausar campanhas acima do limite
  const paraPausar = resultados.filter((r) => r.status === "acima_limite");

  log(`\n[3/3] Pausando ${paraPausar.length} campanha(s) com CPL > R$ ${CPL_LIMITE}...\n`);

  let pausadas = 0;
  let errosPausa = 0;

  for (const { campanha, cpl } of paraPausar) {
    try {
      if (DRY_RUN) {
        log(`  [DRY RUN] Pausaria: ${campanha.name} (CPL: R$ ${cpl.toFixed(2)})`);
        pausadas++;
      } else {
        const sucesso = await pausarCampanha(campanha.id);
        if (sucesso) {
          log(`  [PAUSADA] ${campanha.name} (CPL: R$ ${cpl.toFixed(2)})`);
          pausadas++;
        } else {
          log(`  [FALHA] Não foi possível pausar: ${campanha.name}`);
          errosPausa++;
        }
      }
    } catch (err) {
      const mensagem = extrairMensagemErro(err);
      log(`  [ERRO] Falha ao pausar ${campanha.name} — ${mensagem}`);
      errosPausa++;
    }
  }

  // Resumo final
  const semDados = resultados.filter((r) => r.status === "sem_dados").length;
  const semLeads = resultados.filter((r) => r.status === "sem_leads").length;
  const ok = resultados.filter((r) => r.status === "ok").length;
  const errosInsights = resultados.filter((r) => r.status === "erro").length;

  log("\n" + "=".repeat(60));
  log("RESUMO DA EXECUÇÃO");
  log("=".repeat(60));
  log(`Campanhas analisadas : ${campanhas.length}`);
  log(`  → CPL OK           : ${ok}`);
  log(`  → Acima do limite  : ${paraPausar.length}`);
  log(`  → Sem dados 24h    : ${semDados}`);
  log(`  → Sem leads        : ${semLeads}`);
  log(`  → Erros insights   : ${errosInsights}`);
  log(`Campanhas pausadas   : ${pausadas}${DRY_RUN ? " (dry run)" : ""}`);
  if (errosPausa > 0) log(`Erros ao pausar      : ${errosPausa}`);
  const duracao = ((Date.now() - inicio.getTime()) / 1000).toFixed(1);
  log(`Tempo de execução    : ${duracao}s`);
  log("=".repeat(60));

  return { total: campanhas.length, pausadas, erros: errosPausa + errosInsights };
}

function log(msg) {
  console.log(msg);
}

function extrairMensagemErro(err) {
  // Tenta extrair a mensagem de erro da Meta API
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.error_user_msg ||
    err?.message ||
    "Erro desconhecido"
  );
}

function resumo(total, pausadas, erros) {
  return { total, pausadas, erros };
}

module.exports = { executarAgente };
