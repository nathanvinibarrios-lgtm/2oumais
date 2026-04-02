require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const BASE = `https://graph.facebook.com/${process.env.META_API_VERSION || "v19.0"}`;
const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;

const PAGE_ID = "103912689145351";
const IG_USER_ID = "17841430243529969";
const FORM_ID = "1994891521448757";

const PASTA = "/Users/nathan/Documents/Anuncio 2oumais";
const FEED_IMG = path.join(PASTA, "Anuncio 05 - Imagem Nathan - Feed.jpeg");
const STORIES_IMG = path.join(PASTA, "Anuncio 05 Imagem nathan Stories e Reeelz..jpeg");

const TEXTO = `Seu negócio está travado no boca a boca?
Sem estratégia de tráfego pago, você pode estar perdendo clientes todos os dias enquanto seus concorrentes avançam.
Indicação não é estratégia. Esperar não é plano de crescimento.
🎯 Com campanhas inteligentes focadas no seu público ideal, transformamos cliques em novos clientes.
Clique no botão abaixo e fale agora com nosso time!`;

const HEADLINE = "Fale agora com nosso time!";

function log(msg) { console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${msg}`); }

// ── Upload imagem ─────────────────────────────────────────────────────────────

async function uploadImagem(filePath, label) {
  log(`Enviando imagem: ${label}...`);
  const form = new FormData();
  form.append("filename", fs.createReadStream(filePath));
  form.append("access_token", TOKEN);

  const res = await axios.post(`${BASE}/${ACCOUNT}/adimages`, form, {
    headers: form.getHeaders(),
  });

  const hash = Object.values(res.data.images)[0].hash;
  log(`✅ Imagem "${label}" — hash: ${hash}`);
  return hash;
}

// ── Criar campanha ────────────────────────────────────────────────────────────

async function criarCampanha() {
  log("Criando campanha...");
  const res = await axios.post(`${BASE}/${ACCOUNT}/campaigns`, null, {
    params: {
      name: "[Leads] - [Forms] - Empresários > Brasil + Campo Grande",
      objective: "OUTCOME_LEADS",
      status: "ACTIVE",
      special_ad_categories: JSON.stringify([]),
      is_adset_budget_sharing_enabled: false,
      access_token: TOKEN,
    },
  });
  log(`✅ Campanha criada — ID: ${res.data.id}`);
  return res.data.id;
}

// ── Criar conjunto ────────────────────────────────────────────────────────────

async function criarAdSet(campId, nome, targeting) {
  log(`Criando conjunto: ${nome}...`);
  const res = await axios.post(`${BASE}/${ACCOUNT}/adsets`, null, {
    params: {
      name: nome,
      campaign_id: campId,
      optimization_goal: "LEAD_GENERATION",
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      daily_budget: 2500,
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify({ page_id: PAGE_ID }),
      status: "ACTIVE",
      access_token: TOKEN,
    },
  });
  log(`✅ Conjunto "${nome}" — ID: ${res.data.id}`);
  return res.data.id;
}

// ── Criar criativo de imagem ──────────────────────────────────────────────────

async function criarCriativo(nome, imageHash) {
  log(`Criando criativo: ${nome}...`);
  const res = await axios.post(`${BASE}/${ACCOUNT}/adcreatives`, null, {
    params: {
      name: nome,
      object_story_spec: JSON.stringify({
        page_id: PAGE_ID,
        link_data: {
          message: TEXTO,
          name: HEADLINE,
          image_hash: imageHash,
          link: "http://fb.me/",
          call_to_action: {
            type: "LEARN_MORE",
            value: { lead_gen_form_id: FORM_ID },
          },
        },
      }),
      access_token: TOKEN,
    },
  });
  log(`✅ Criativo "${nome}" — ID: ${res.data.id}`);
  return res.data.id;
}

// ── Criar anúncio ─────────────────────────────────────────────────────────────

async function criarAnuncio(adsetId, creativeId, nome) {
  log(`Criando anúncio: ${nome}...`);
  const res = await axios.post(`${BASE}/${ACCOUNT}/ads`, null, {
    params: {
      name: nome,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: "ACTIVE",
      access_token: TOKEN,
    },
  });
  log(`✅ Anúncio "${nome}" — ID: ${res.data.id}`);
  return res.data.id;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Criando Campanha 2oumais — Empresários ===\n");

  // Upload das imagens
  const hashFeed = await uploadImagem(FEED_IMG, "Feed");
  const hashStories = await uploadImagem(STORIES_IMG, "Stories/Reels");

  // Campanha
  const campId = await criarCampanha();

  // Conjuntos
  const targetingBrasil = {
    age_min: 23,
    age_max: 65,
    geo_locations: { countries: ["BR"], location_types: ["home", "recent"] },
    targeting_automation: { advantage_audience: 1 },
    publisher_platforms: ["facebook", "instagram"],
  };

  const targetingCampoGrande = {
    age_min: 23,
    age_max: 65,
    geo_locations: {
      custom_locations: [{
        latitude: -20.4686,
        longitude: -54.6292,
        radius: 12,
        distance_unit: "kilometer",
        address_string: "Campo Grande, MS, Brasil",
      }],
      location_types: ["home", "recent"],
    },
    targeting_automation: { advantage_audience: 1 },
    publisher_platforms: ["facebook", "instagram"],
  };

  const adsetBrasilId = await criarAdSet(campId, "CJ1 - Brasil - Adv+ - 23+ anos", targetingBrasil);
  const adsetCGId = await criarAdSet(campId, "CJ2 - Campo Grande MS - 12km - Adv+ - 23+ anos", targetingCampoGrande);

  // Criativos de imagem
  const creativeFeedId = await criarCriativo("Criativo - Imagem 05 Feed", hashFeed);
  const creativeStoriesId = await criarCriativo("Criativo - Imagem 05 Stories/Reels", hashStories);

  // Anúncios — Conjunto 1 (Brasil)
  console.log("\n--- Conjunto 1: Brasil ---");
  await criarAnuncio(adsetBrasilId, creativeFeedId, "Anuncio 05 - Imagem Feed — Brasil");
  await criarAnuncio(adsetBrasilId, creativeStoriesId, "Anuncio 05 - Stories/Reels — Brasil");

  // Anúncios — Conjunto 2 (Campo Grande)
  console.log("\n--- Conjunto 2: Campo Grande ---");
  await criarAnuncio(adsetCGId, creativeFeedId, "Anuncio 05 - Imagem Feed — Campo Grande");
  await criarAnuncio(adsetCGId, creativeStoriesId, "Anuncio 05 - Stories/Reels — Campo Grande");

  console.log(`
╔══════════════════════════════════════════════╗
║        ✅  CAMPANHA CRIADA COM SUCESSO        ║
╚══════════════════════════════════════════════╝

📋 Campanha ID : ${campId}
🇧🇷 Conjunto 1  : ${adsetBrasilId}  (Brasil)
📍 Conjunto 2  : ${adsetCGId}  (Campo Grande 12km)

⚠️  PRÓXIMO PASSO — Adicionar o vídeo podcast manualmente:
  1. Abra o Gerenciador de Anúncios
  2. Entre na campanha "[Leads] - [Forms] - Empresários"
  3. Em cada conjunto, clique em "+ Criar anúncio"
  4. Selecione "Anuncio 06 - Vídeo Podcast"
  5. Faça upload de: ${path.basename("/Users/nathan/Documents/Anuncio 2oumais/anuncio 05 - Pod cast nathan.mp4")}

💡 Dica: use o mesmo texto e formulário ID: ${FORM_ID}
`);
}

main().catch(err => {
  console.error("\n❌ ERRO:", err.response?.data?.error?.message || err.message);
  if (err.response?.data?.error) console.error(JSON.stringify(err.response.data.error, null, 2));
  process.exit(1);
});
