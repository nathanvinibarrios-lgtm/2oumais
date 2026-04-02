const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } = require("docx");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const TEMPLATE_FILE = path.join(__dirname, "../data/template-contrato.txt");

function lerTemplatePersonalizado() {
  try {
    if (fs.existsSync(TEMPLATE_FILE)) return fs.readFileSync(TEMPLATE_FILE, "utf8");
  } catch {}
  return null;
}

function preencherTemplate(templateStr, dados) {
  const c = preencherContrato(dados);
  return templateStr
    .replace(/\{\{empresaNome\}\}/g,             c.contratante.nome       || "")
    .replace(/\{\{empresaCnpj\}\}/g,             c.contratante.cnpj       || "")
    .replace(/\{\{empresaEndereco\}\}/g,         c.contratante.endereco   || "")
    .replace(/\{\{representanteNome\}\}/g,       c.contratante.representante || "")
    .replace(/\{\{representanteCpf\}\}/g,        c.contratante.cpf        || "")
    .replace(/\{\{cidadeContratante\}\}/g,       c.cidadeContratante      || "")
    .replace(/\{\{valorMensal\}\}/g,             c.valorMensal            || "")
    .replace(/\{\{valorFinal\}\}/g,              c.valorFinal             || "")
    .replace(/\{\{desconto\}\}/g,                c.desconto               || "")
    .replace(/\{\{valorPermuta\}\}/g,            c.valorPermuta           || "")
    .replace(/\{\{dataInicio\}\}/g,              c.dataInicio             || "")
    .replace(/\{\{dataFim\}\}/g,                 c.dataFim                || "")
    .replace(/\{\{duracao\}\}/g,                 c.duracao                || "")
    .replace(/\{\{dataAssinatura\}\}/g,          c.dataAssinatura         || "")
    .replace(/\{\{cidadeAssinatura\}\}/g,        c.cidadeAssinatura       || "")
    .replace(/\{\{servicos\}\}/g,                c.servicos               || "")
    .replace(/\{\{contratadoNome\}\}/g,          c.contratado.nome        || "")
    .replace(/\{\{contratadoCnpj\}\}/g,          c.contratado.cnpj        || "")
    .replace(/\{\{contratadoRepresentante\}\}/g, c.contratado.representante || "");
}

async function gerarPDFTemplate(templateStr, dados) {
  return new Promise((resolve, reject) => {
    const filled = preencherTemplate(templateStr, dados);
    const doc = new PDFDocument({ margin: 60, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica").fontSize(11);
    const lines = filled.split("\n");
    for (const line of lines) {
      if (line.trim() === "") {
        doc.moveDown(0.5);
      } else {
        doc.text(line, { align: "justify" });
      }
    }
    doc.end();
  });
}

async function gerarDocxTemplate(templateStr, dados) {
  const filled = preencherTemplate(templateStr, dados);
  const paragraphs = filled.split("\n").map(line =>
    new Paragraph({
      children: [new TextRun({ text: line, size: 22, font: "Arial" })],
      spacing: { after: line.trim() === "" ? 200 : 80 },
    })
  );
  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  return Packer.toBuffer(doc);
}

/**
 * Preenche os dados variáveis do contrato.
 * @param {object} dados - dados do contratante
 * @returns {object} contrato completo
 */
function preencherContrato(dados) {
  const {
    servicos,
    duracao,
    empresaNome,
    empresaCnpj,
    empresaEndereco,
    representanteNome,
    representanteCpf,
    cidadeContratante,
    dataInicio,
    valorMensal,
    desconto,
    valorPermuta,
    dataAssinatura,
    cidadeAssinatura,
  } = dados;

  const duracaoLabels = { 3: '3 (três) meses', 6: '6 (seis) meses', 8: '8 (oito) meses', 12: '12 (doze) meses' };
  const duracaoMeses = parseInt(duracao) || 6;

  const valNum  = parseFloat(String(valorMensal || "0").replace(/\./g,"").replace(",",".")) || 0;
  const descNum = parseFloat(String(desconto   || "0").replace(/\./g,"").replace(",",".")) || 0;
  const valorFinal = valNum - descNum;

  let dataFim = "";
  if (dataInicio) {
    const fim = new Date(dataInicio);
    fim.setMonth(fim.getMonth() + duracaoMeses);
    const [a, m, d] = fim.toISOString().split("T")[0].split("-");
    dataFim = `${d}/${m}/${a}`;
  }

  return {
    contratante: {
      nome: empresaNome,
      cnpj: empresaCnpj,
      endereco: empresaEndereco,
      representante: representanteNome,
      cpf: representanteCpf,
    },
    contratado: {
      nome: "DOIS OU MAIS MARKETING DIGITAL",
      cnpj: "42.530.632/0001-07",
      endereco: "AV. Tamandaré, 6000, Campo Grande - MS",
      representante: "REZIÉLY BENITE DIAS",
      cpf: "065.316.621-40",
    },
    servicos,
    cidadeContratante: cidadeContratante || null,
    dataInicio,
    dataFim,
    duracao: duracaoLabels[duracaoMeses] || `${duracaoMeses} meses`,
    duracaoMeses,
    valorMensal,
    desconto: descNum > 0 ? desconto : null,
    valorFinal: valorFinal.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2}),
    valorPermuta,
    dataAssinatura,
    cidadeAssinatura,
  };
}

function formatarData(dataISO) {
  if (!dataISO) return "___/___/______";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function valorPorExtenso(valor) {
  // Mapa simples para valores comuns
  const map = {
    "1850": "mil, oitocentos e cinquenta reais",
    "1850,00": "mil, oitocentos e cinquenta reais",
    "350": "trezentos e cinquenta reais",
    "350,00": "trezentos e cinquenta reais",
  };
  const key = String(valor).replace("R$", "").trim().replace(".", "");
  return map[key] || `${valor} reais`;
}

/**
 * Gera o documento Word (.docx)
 */
async function gerarDocx(dados) {
  const c = preencherContrato(dados);

  const titulo = (text) =>
    new Paragraph({
      children: [new TextRun({ text, bold: true, size: 26, font: "Arial" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    });

  const secao = (text) =>
    new Paragraph({
      children: [new TextRun({ text, bold: true, size: 22, font: "Arial" })],
      spacing: { before: 300, after: 150 },
    });

  const paragrafo = (text, negrito = false) =>
    new Paragraph({
      children: [new TextRun({ text, size: 22, font: "Arial", bold: negrito })],
      spacing: { after: 150 },
      alignment: AlignmentType.JUSTIFIED,
    });

  const linha = () =>
    new Paragraph({
      children: [new TextRun({ text: "", size: 22 })],
      spacing: { after: 100 },
    });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1440 },
          },
        },
        children: [
          titulo("CONTRATO DE PRESTAÇÃO DE SERVIÇOS"),
          titulo("Gestão de Anúncios Online e Automação"),
          linha(),
          paragrafo(`Pelo presente instrumento particular, as partes abaixo qualificadas celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:`),
          linha(),
          secao("1. DAS PARTES"),
          paragrafo(`CONTRATANTE: ${c.contratante.nome}, inscrita no CNPJ sob o nº ${c.contratante.cnpj}, com sede em ${c.contratante.endereco}, neste ato representada por ${c.contratante.representante}, portadora do CPF nº ${c.contratante.cpf}.`),
          linha(),
          paragrafo(`CONTRATADO: ${c.contratado.nome}, inscrita no CNPJ sob o nº ${c.contratado.cnpj}, com sede em ${c.contratado.endereco}, neste ato representada por ${c.contratado.representante}, portadora do CPF nº ${c.contratado.cpf}.`),
          linha(),
          secao("2. DO OBJETO"),
          paragrafo(`2.1. O CONTRATADO obriga-se a prestar ao CONTRATANTE os seguintes serviços:`),
          ...(c.servicos
            ? c.servicos.split("\n").filter(l => l.trim()).map(l => paragrafo(l.trim()))
            : [paragrafo("Serviços de marketing digital conforme acordado entre as partes.")]),
          linha(),
          secao("3. DO PRAZO"),
          paragrafo(`3.1. O presente contrato terá vigência de ${c.duracao}, com início em ${formatarData(c.dataInicio)}, podendo ser renovado mediante acordo entre as partes.`),
          paragrafo(`3.2. Qualquer das partes poderá rescindir o contrato mediante aviso prévio de 30 (trinta) dias, por escrito.`),
          linha(),
          secao("4. DO VALOR E FORMA DE PAGAMENTO"),
          paragrafo(`4.1. Pela prestação dos serviços descritos na Cláusula 2, o CONTRATANTE pagará ao CONTRATADO o valor mensal de R$ ${c.valorMensal}${c.desconto ? `, com desconto de R$ ${c.desconto}, perfazendo o valor líquido mensal de R$ ${c.valorFinal} (${valorPorExtenso(c.valorFinal)})` : ` (${valorPorExtenso(c.valorMensal)})`}, a ser pago até o dia 10 de cada mês.`),
          ...(c.valorPermuta ? [paragrafo(`4.2. Fica acordado entre as partes uma permuta no valor de R$ ${c.valorPermuta} (${valorPorExtenso(c.valorPermuta)}), que será descontada do valor total mensal.`)] : []),
          paragrafo(`${c.valorPermuta ? '4.3' : '4.2'}. O pagamento será realizado via transferência bancária, PIX ou boleto bancário, conforme dados fornecidos pelo CONTRATADO.`),
          paragrafo(`${c.valorPermuta ? '4.4' : '4.3'}. O atraso no pagamento sujeitará o CONTRATANTE a multa de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês.`),
          linha(),
          secao("5. DAS OBRIGAÇÕES DO CONTRATADO"),
          paragrafo(`5.1. Executar os serviços com qualidade, eficiência e dentro dos prazos acordados.`),
          paragrafo(`5.2. Manter sigilo sobre todas as informações confidenciais do CONTRATANTE.`),
          paragrafo(`5.3. Apresentar relatórios mensais com os resultados das campanhas.`),
          paragrafo(`5.4. Responder prontamente às solicitações do CONTRATANTE dentro do horário comercial.`),
          paragrafo(`5.5. Respeitar as normas e diretrizes das plataformas de anúncios utilizadas.`),
          linha(),
          secao("6. DAS OBRIGAÇÕES DO CONTRATANTE"),
          paragrafo(`6.1. Fornecer ao CONTRATADO todas as informações, materiais e acessos necessários para a execução dos serviços.`),
          paragrafo(`6.2. Efetuar os pagamentos nas datas acordadas.`),
          paragrafo(`6.3. Destinar o orçamento de mídia (verba de anúncios) diretamente nas plataformas, valor este não incluso na mensalidade do CONTRATADO.`),
          paragrafo(`6.4. Comunicar ao CONTRATADO quaisquer alterações relevantes em seus produtos, serviços ou público-alvo.`),
          linha(),
          secao("7. DA PROPRIEDADE INTELECTUAL"),
          paragrafo(`7.1. Todos os criativos, textos, estratégias e materiais desenvolvidos pelo CONTRATADO para o CONTRATANTE serão de propriedade do CONTRATANTE após a quitação integral dos serviços.`),
          paragrafo(`7.2. O CONTRATADO poderá utilizar os resultados obtidos como portfólio, desde que não revele informações confidenciais do CONTRATANTE.`),
          linha(),
          secao("8. DA RESCISÃO"),
          paragrafo(`8.1. O contrato poderá ser rescindido por qualquer das partes mediante notificação prévia de 30 (trinta) dias.`),
          paragrafo(`8.2. Em caso de rescisão antecipada pelo CONTRATANTE antes do término do prazo contratual, será devida multa rescisória equivalente a 30% (trinta por cento) do valor total correspondente ao período remanescente do contrato, calculado com base na mensalidade vigente.`),
          paragrafo(`8.3. Em caso de inadimplência superior a 15 (quinze) dias, o CONTRATADO poderá suspender os serviços e rescindir o contrato imediatamente.`),
          paragrafo(`8.4. O CONTRATANTE ficará isento de qualquer penalidade rescisória prevista na Cláusula 8.2 caso as campanhas de tráfego pago gerenciadas pelo CONTRATADO não gerem nenhum contato interessado no período de 30 (trinta) dias, desde que o CONTRATANTE tenha cumprido integralmente suas obrigações previstas na Cláusula 6, notadamente o aporte regular da verba de mídia. Nessa circunstância, é facultado ao CONTRATANTE rescindir o presente instrumento mediante notificação escrita, sem ônus de qualquer natureza.`),
          linha(),
          secao("9. DO FORO"),
          paragrafo(`9.1. As partes elegem o foro da Comarca de Campo Grande - MS, Estado de Mato Grosso do Sul${c.cidadeContratante ? `, e o foro da Comarca de ${c.cidadeContratante}` : ''}, como foros de eleição para dirimir quaisquer dúvidas ou litígios oriundos do presente contrato, com renúncia expressa de qualquer outro, por mais privilegiado que seja.`),
          linha(),
          paragrafo(`Por estarem assim justos e contratados, assinam o presente instrumento em 2 (duas) vias de igual teor, na presença das testemunhas abaixo.`),
          linha(),
          paragrafo(`${c.cidadeAssinatura || "Campo Grande - MS"}, ${formatarData(c.dataAssinatura)}`),
          linha(),
          linha(),
          paragrafo("_____________________________________________"),
          paragrafo(`${c.contratante.nome}`),
          paragrafo(`CONTRATANTE`),
          paragrafo(`CPF: ${c.contratante.cpf}`),
          linha(),
          linha(),
          paragrafo("_____________________________________________"),
          paragrafo(`${c.contratado.nome}`),
          paragrafo(`CONTRATADO`),
          paragrafo(`CNPJ: ${c.contratado.cnpj}`),
          linha(),
          linha(),
          secao("TESTEMUNHAS:"),
          paragrafo("1. _____________________________________ CPF: ___________________"),
          linha(),
          paragrafo("2. _____________________________________ CPF: ___________________"),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Gera o PDF do contrato
 */
function gerarPDF(dados) {
  return new Promise((resolve, reject) => {
    const c = preencherContrato(dados);
    const doc = new PDFDocument({ margin: 60, size: "A4" });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const W = doc.page.width - 120; // largura útil

    // Cabeçalho
    doc.font("Helvetica-Bold").fontSize(14).text("CONTRATO DE PRESTAÇÃO DE SERVIÇOS", { align: "center" });
    doc.fontSize(12).text("Gestão de Anúncios Online e Automação", { align: "center" });
    doc.moveDown(1);

    doc.font("Helvetica").fontSize(10).text(
      "Pelo presente instrumento particular, as partes abaixo qualificadas celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:",
      { align: "justify" }
    );
    doc.moveDown(1);

    const secao = (txt) => {
      doc.font("Helvetica-Bold").fontSize(10).text(txt);
      doc.font("Helvetica").fontSize(10);
      doc.moveDown(0.4);
    };

    const p = (txt) => {
      doc.font("Helvetica").fontSize(10).text(txt, { align: "justify" });
      doc.moveDown(0.4);
    };

    secao("1. DAS PARTES");
    p(`CONTRATANTE: ${c.contratante.nome}, inscrita no CNPJ sob o nº ${c.contratante.cnpj}, com sede em ${c.contratante.endereco}, neste ato representada por ${c.contratante.representante}, portadora do CPF nº ${c.contratante.cpf}.`);
    p(`CONTRATADO: ${c.contratado.nome}, inscrita no CNPJ sob o nº ${c.contratado.cnpj}, com sede em ${c.contratado.endereco}, neste ato representada por ${c.contratado.representante}, portadora do CPF nº ${c.contratado.cpf}.`);

    secao("2. DO OBJETO");
    p("2.1. O CONTRATADO obriga-se a prestar ao CONTRATANTE os seguintes serviços:");
    if (c.servicos) {
      c.servicos.split("\n").filter(l => l.trim()).forEach(l => p(l.trim()));
    } else {
      p("Serviços de marketing digital conforme acordado entre as partes.");
    }

    secao("3. DO PRAZO");
    p(`3.1. O presente contrato terá vigência de ${c.duracao}, com início em ${formatarData(c.dataInicio)}, podendo ser renovado mediante acordo entre as partes.`);
    p("3.2. Qualquer das partes poderá rescindir o contrato mediante notificação prévia de 30 (trinta) dias por escrito, observadas as penalidades previstas na Cláusula 8.");

    secao("4. DO VALOR E FORMA DE PAGAMENTO");
    p(`4.1. Pela prestação dos serviços descritos na Cláusula 2, o CONTRATANTE pagará ao CONTRATADO o valor mensal de R$ ${c.valorMensal}${c.desconto ? `, com desconto de R$ ${c.desconto}, perfazendo o valor líquido mensal de R$ ${c.valorFinal} (${valorPorExtenso(c.valorFinal)})` : ` (${valorPorExtenso(c.valorMensal)})`}, a ser pago até o dia 10 de cada mês.`);
    if (c.valorPermuta) p(`4.2. Fica acordado entre as partes uma permuta no valor de R$ ${c.valorPermuta} (${valorPorExtenso(c.valorPermuta)}), que será descontada do valor total mensal.`);
    p(`${c.valorPermuta ? '4.3' : '4.2'}. O pagamento será realizado via transferência bancária, PIX ou boleto bancário, conforme dados fornecidos pelo CONTRATADO.`);
    p(`${c.valorPermuta ? '4.4' : '4.3'}. O atraso no pagamento sujeitará o CONTRATANTE a multa de 2% sobre o valor em atraso, acrescida de juros de mora de 1% ao mês.`);

    secao("5. DAS OBRIGAÇÕES DO CONTRATADO");
    p("5.1. Executar os serviços com qualidade, eficiência e dentro dos prazos acordados.");
    p("5.2. Manter sigilo sobre todas as informações confidenciais do CONTRATANTE.");
    p("5.3. Apresentar relatórios mensais com os resultados das campanhas.");
    p("5.4. Responder prontamente às solicitações do CONTRATANTE dentro do horário comercial.");
    p("5.5. Respeitar as normas e diretrizes das plataformas de anúncios utilizadas.");

    secao("6. DAS OBRIGAÇÕES DO CONTRATANTE");
    p("6.1. Fornecer ao CONTRATADO todas as informações, materiais e acessos necessários para a execução dos serviços.");
    p("6.2. Efetuar os pagamentos nas datas acordadas.");
    p("6.3. Destinar o orçamento de mídia diretamente nas plataformas, valor não incluso na mensalidade.");
    p("6.4. Comunicar ao CONTRATADO quaisquer alterações relevantes em seus produtos, serviços ou público-alvo.");

    secao("7. DA PROPRIEDADE INTELECTUAL");
    p("7.1. Todos os criativos, textos e materiais desenvolvidos pelo CONTRATADO serão de propriedade do CONTRATANTE após quitação integral.");
    p("7.2. O CONTRATADO poderá utilizar os resultados como portfólio, sem revelar informações confidenciais.");

    secao("8. DA RESCISÃO");
    p("8.1. O contrato poderá ser rescindido por qualquer das partes mediante notificação prévia de 30 (trinta) dias.");
    p("8.2. Em caso de rescisão antecipada pelo CONTRATANTE antes do término do prazo contratual, será devida multa rescisória equivalente a 30% (trinta por cento) do valor total correspondente ao período remanescente do contrato, calculado com base na mensalidade vigente.");
    p("8.3. Inadimplência superior a 15 dias autoriza o CONTRATADO a suspender serviços e rescindir imediatamente.");
    p("8.4. O CONTRATANTE ficará isento de qualquer penalidade rescisória prevista na Cláusula 8.2 caso as campanhas de tráfego pago gerenciadas pelo CONTRATADO não gerem nenhum contato interessado no período de 30 (trinta) dias, desde que o CONTRATANTE tenha cumprido integralmente suas obrigações previstas na Cláusula 6, notadamente o aporte regular da verba de mídia. Nessa circunstância, é facultado ao CONTRATANTE rescindir o presente instrumento mediante notificação escrita, sem ônus de qualquer natureza.");

    secao("9. DO FORO");
    p(`9.1. As partes elegem o foro da Comarca de Campo Grande - MS, Estado de Mato Grosso do Sul${c.cidadeContratante ? `, e o foro da Comarca de ${c.cidadeContratante}` : ''}, como foros de eleição para dirimir quaisquer litígios oriundos do presente contrato, com renúncia expressa de qualquer outro, por mais privilegiado que seja.`);

    doc.moveDown(1);
    p("Por estarem assim justos e contratados, assinam o presente instrumento em 2 (duas) vias de igual teor.");
    doc.moveDown(1);
    p(`${c.cidadeAssinatura || "Campo Grande - MS"}, ${formatarData(c.dataAssinatura)}`);

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(10);
    doc.text("_____________________________________________", { align: "left" });
    doc.text(`${c.contratante.nome}`, { align: "left" });
    doc.text("CONTRATANTE", { align: "left" });
    doc.text(`CPF: ${c.contratante.cpf}`, { align: "left" });

    doc.moveDown(2);
    doc.text("_____________________________________________", { align: "left" });
    doc.text(`${c.contratado.nome}`, { align: "left" });
    doc.text("CONTRATADO", { align: "left" });
    doc.text(`CNPJ: ${c.contratado.cnpj}`, { align: "left" });

    doc.moveDown(2);
    doc.font("Helvetica-Bold").text("TESTEMUNHAS:");
    doc.font("Helvetica");
    doc.moveDown(0.5);
    doc.text("1. _____________________________________ CPF: ___________________");
    doc.moveDown(1);
    doc.text("2. _____________________________________ CPF: ___________________");

    doc.end();
  });
}

async function gerarDocxFinal(dados) {
  const tpl = lerTemplatePersonalizado();
  if (tpl) return gerarDocxTemplate(tpl, dados);
  return gerarDocx(dados);
}

async function gerarPDFFinal(dados) {
  const tpl = lerTemplatePersonalizado();
  if (tpl) return gerarPDFTemplate(tpl, dados);
  return gerarPDF(dados);
}

module.exports = { gerarDocx: gerarDocxFinal, gerarPDF: gerarPDFFinal };
