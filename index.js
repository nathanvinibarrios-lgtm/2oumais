require("dotenv").config();

const { executarAgente } = require("./src/agent");

executarAgente().catch((err) => {
  console.error("Erro fatal:", err.message || err);
  process.exit(1);
});
