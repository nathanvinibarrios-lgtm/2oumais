const axios = require("axios");

const BASE_URL = `https://graph.facebook.com/${process.env.META_API_VERSION || "v19.0"}`;

/**
 * Busca todas as campanhas ativas da conta de anúncios.
 * @returns {Promise<Array>} Lista de campanhas ativas
 */
async function getCampanhasAtivas() {
  const accountId = process.env.META_AD_ACCOUNT_ID;

  const response = await axios.get(`${BASE_URL}/${accountId}/campaigns`, {
    params: {
      effective_status: JSON.stringify(["ACTIVE"]),
      fields: "id,name,status,effective_status,objective",
      limit: 500,
      access_token: process.env.META_ACCESS_TOKEN,
    },
  });

  return response.data.data || [];
}

/**
 * Busca os insights de uma campanha nas últimas 24 horas.
 * A API do Meta trabalha com granularidade de dia, então usamos
 * today + yesterday para cobrir as últimas 24h independente do horário.
 *
 * @param {string} campaignId - ID da campanha
 * @returns {Promise<Object|null>} Dados de insights ou null se sem dados
 */
async function getInsightsCampanha(campaignId, dias = 1) {
  const agora = new Date();
  const inicio = formatarData(new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000));
  const fim = formatarData(agora);

  const response = await axios.get(`${BASE_URL}/${campaignId}/insights`, {
    params: {
      fields: "spend,actions,action_values,impressions,clicks",
      time_range: JSON.stringify({ since: inicio, until: fim }),
      access_token: process.env.META_ACCESS_TOKEN,
    },
  });

  const dados = response.data.data;
  return dados && dados.length > 0 ? dados[0] : null;
}

/**
 * Pausa uma campanha definindo seu status como PAUSED.
 *
 * @param {string} campaignId - ID da campanha
 * @returns {Promise<boolean>} true se pausada com sucesso
 */
async function pausarCampanha(campaignId) {
  const response = await axios.post(
    `${BASE_URL}/${campaignId}`,
    null,
    {
      params: {
        status: "PAUSED",
        access_token: process.env.META_ACCESS_TOKEN,
      },
    }
  );

  return response.data.success === true;
}

/**
 * Extrai o número de leads de um array de actions retornado pela API.
 * Considera os action_types mais comuns para leads.
 *
 * @param {Array} actions - Array de ações da Meta API
 * @returns {number} Total de leads
 */
function extrairLeads(actions) {
  if (!actions || !Array.isArray(actions)) return 0;

  const tiposLead = [
    "lead",
  ];

  return actions
    .filter((a) => tiposLead.includes(a.action_type))
    .reduce((soma, a) => soma + parseFloat(a.value || "0"), 0);
}

/**
 * Formata um objeto Date para o formato YYYY-MM-DD exigido pela Meta API.
 *
 * @param {Date} data
 * @returns {string}
 */
function formatarData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Busca insights por anúncio (nível ad) dentro de uma campanha.
 */
async function getInsightsPorAnuncio(campaignId, dias = 1) {
  const agora = new Date();
  const inicio = formatarData(new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000));
  const fim = formatarData(agora);

  const response = await axios.get(`${BASE_URL}/${campaignId}/insights`, {
    params: {
      level: "ad",
      fields: "ad_id,ad_name,spend,impressions,clicks,actions,ctr,cpc",
      time_range: JSON.stringify({ since: inicio, until: fim }),
      limit: 100,
      access_token: process.env.META_ACCESS_TOKEN,
    },
  });

  return response.data.data || [];
}

/**
 * Busca anúncios ativos de uma campanha com info do criativo.
 */
async function getAnunciosAtivos(campaignId) {
  const response = await axios.get(`${BASE_URL}/${campaignId}/ads`, {
    params: {
      fields: "id,name,effective_status,creative{thumbnail_url,title,body}",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED"]),
      limit: 100,
      access_token: process.env.META_ACCESS_TOKEN,
    },
  });

  return response.data.data || [];
}

/**
 * Busca leads reais (preenchimentos de formulário) da conta de anúncios.
 * Retorna os últimos leads com nome, telefone, email e dados da campanha.
 *
 * @param {number} dias - Período retroativo
 * @returns {Promise<Array>}
 */
async function getLeadsMeta(dias = 7) {
  const accountId = process.env.META_AD_ACCOUNT_ID;

  const agora = new Date();
  const inicio = formatarData(new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000));

  const response = await axios.get(`${BASE_URL}/${accountId}/leads`, {
    params: {
      fields: "id,created_time,field_data,campaign_id,campaign_name,ad_id,ad_name,form_id",
      filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(new Date(inicio).getTime() / 1000) }]),
      limit: 200,
      access_token: process.env.META_ACCESS_TOKEN,
    },
  });

  return (response.data.data || []).map(lead => {
    const campos = {};
    for (const f of (lead.field_data || [])) {
      campos[f.name] = (f.values || [])[0] || "";
    }
    return {
      metaLeadId: lead.id,
      criadoEm:   lead.created_time,
      nome:       campos["full_name"] || campos["nome"] || campos["name"] || "",
      email:      campos["email"] || "",
      fone:       (campos["phone_number"] || campos["telefone"] || campos["whatsapp"] || "").replace(/\D/g, ""),
      campanhaId:   lead.campaign_id   || "",
      campanhaNome: lead.campaign_name || "",
      adNome:       lead.ad_name       || "",
    };
  });
}

module.exports = {
  getCampanhasAtivas,
  getInsightsCampanha,
  getInsightsPorAnuncio,
  getAnunciosAtivos,
  pausarCampanha,
  extrairLeads,
  getLeadsMeta,
};
