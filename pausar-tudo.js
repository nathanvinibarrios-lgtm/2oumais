require("dotenv").config();
const { getCampanhasAtivas, pausarCampanha } = require("./src/metaClient");

async function pausarTodas() {
  console.log("🔍 Buscando campanhas ativas...\n");

  const campanhas = await getCampanhasAtivas();

  if (campanhas.length === 0) {
    console.log("Nenhuma campanha ativa encontrada.");
    return;
  }

  console.log(`Encontradas ${campanhas.length} campanha(s) ativa(s):\n`);
  for (const c of campanhas) {
    console.log(`  • ${c.name} (${c.id})`);
  }

  console.log("\n⏸  Pausando todas...\n");

  for (const c of campanhas) {
    try {
      const ok = await pausarCampanha(c.id);
      console.log(ok ? `  ✅ Pausada: ${c.name}` : `  ❌ Falhou: ${c.name}`);
    } catch (err) {
      console.log(`  ❌ Erro em "${c.name}": ${err.message}`);
    }
  }

  console.log("\nConcluído.");
}

pausarTodas().catch(console.error);
