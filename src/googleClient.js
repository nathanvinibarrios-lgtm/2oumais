require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { GoogleAdsApi } = require("google-ads-api");

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

function getCustomer() {
  return client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });
}

// ── Busca campanhas ativas com métricas ───────────────────────────────────────

async function getCampanhasGoogle(dias = 1) {
  const customer = getCustomer();

  const periodo = dias === 1 ? "TODAY" : dias === 7 ? "LAST_7_DAYS" : "LAST_30_DAYS";

  const rows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.ctr
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date DURING ${periodo}
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map(r => ({
    id: r.campaign.id,
    nome: r.campaign.name,
    gasto: (r.metrics.cost_micros / 1_000_000),
    cliques: r.metrics.clicks,
    impressoes: r.metrics.impressions,
    conversoes: r.metrics.conversions,
    ctr: (r.metrics.ctr * 100),
    cpc: r.metrics.clicks > 0 ? (r.metrics.cost_micros / 1_000_000) / r.metrics.clicks : 0,
  }));
}

// ── Busca palavras-chave com métricas ────────────────────────────────────────

async function getKeywordsGoogle(dias = 7) {
  const customer = getCustomer();
  const periodo = dias === 1 ? "TODAY" : dias === 7 ? "LAST_7_DAYS" : "LAST_30_DAYS";

  const rows = await customer.query(`
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM keyword_view
    WHERE campaign.status = 'ENABLED'
      AND ad_group_criterion.status = 'ENABLED'
      AND segments.date DURING ${periodo}
    ORDER BY metrics.clicks DESC
    LIMIT 20
  `);

  return rows.map(r => ({
    texto: r.ad_group_criterion.keyword.text,
    tipo: { 2: 'Ampla', 3: 'Frase', 4: 'Exata' }[r.ad_group_criterion.keyword.match_type] || '—',
    gasto: r.metrics.cost_micros / 1_000_000,
    cliques: r.metrics.clicks,
    impressoes: r.metrics.impressions,
    ctr: r.metrics.ctr * 100,
    cpc: r.metrics.average_cpc ? r.metrics.average_cpc / 1_000_000 : 0,
    conversoes: r.metrics.conversions,
  }));
}

// ── Pausa uma campanha pelo ID ────────────────────────────────────────────────

async function pausarCampanhaGoogle(campaignId) {
  const customer = getCustomer();
  await customer.campaigns.update([{
    resource_name: `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${campaignId}`,
    status: "PAUSED",
  }]);
  return true;
}

module.exports = { getCampanhasGoogle, getKeywordsGoogle, pausarCampanhaGoogle };
