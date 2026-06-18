const ADULT_SIZES = ["P", "M", "G", "GG", "G1", "G2", "G3"];
const KIDS_SIZES = ["2", "4", "6", "8", "10", "12", "14", "16"];
const SIZE_ORDER = [...ADULT_SIZES, ...KIDS_SIZES];

const COLOR_ALIASES = new Set([
  "cor",
  "cores",
  "color",
  "cor produto",
  "cor do produto",
  "descricao cor",
  "descricao da cor",
  "nome cor",
]);
const SIZE_ALIASES = new Set(["tamanho", "tam", "grade", "size"]);
const MODEL_ALIASES = new Set(["nome estoque", "nome do estoque", "modelo", "produto"]);
const VIRTUAL_QUANTITY_ALIASES = new Set([
  "qtd virtual",
  "qtd. virtual",
  "qtdvirtual",
  "quantidade virtual",
  "qtde virtual",
  "estoque virtual",
]);
const QUANTITY_ALIASES = new Set([
  "estoque",
  "estoque atual",
  "quantidade",
  "qtd",
  "qtde",
  "saldo",
  "disponivel",
  "disponibilidade",
  "pecas",
  "unidades",
]);
const TARGET_ALIASES = new Set(["meta", "alvo", "objetivo", "quantidade meta", "qtd meta", "qtde meta"]);
const TESSERACT_OPTIONS = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js",
  langPath: "https://tessdata.projectnaptha.com/4.0.0",
};

const elements = {
  form: document.getElementById("wizardForm"),
  fabricFile: document.getElementById("fabricFile"),
  siteFile: document.getElementById("siteFile"),
  blockedFile: document.getElementById("blockedFile"),
  blockedText: document.getElementById("blockedText"),
  fabricFileName: document.getElementById("fabricFileName"),
  siteFileName: document.getElementById("siteFileName"),
  blockedFileName: document.getElementById("blockedFileName"),
  modelPicker: document.getElementById("modelPicker"),
  modelNotice: document.getElementById("modelNotice"),
  modelSearch: document.getElementById("modelSearch"),
  modelValue: document.getElementById("modelValue"),
  modelResults: document.getElementById("modelResults"),
  adultSizes: document.getElementById("adultSizes"),
  kidsSizes: document.getElementById("kidsSizes"),
  backButton: document.getElementById("backButton"),
  nextButton: document.getElementById("nextButton"),
  processButton: document.getElementById("processButton"),
  statusBox: document.getElementById("status"),
  summaryFabric: document.getElementById("summaryFabric"),
  summarySite: document.getElementById("summarySite"),
  summaryMeta: document.getElementById("summaryMeta"),
  summaryBlocked: document.getElementById("summaryBlocked"),
};

let currentStep = 1;
let siteRowsCache = null;
let siteFileSignature = "";
let siteModels = [];

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

renderSizeInputs(elements.adultSizes, ADULT_SIZES);
renderSizeInputs(elements.kidsSizes, KIDS_SIZES);
setupFileInput(elements.fabricFile, elements.fabricFileName);
setupFileInput(elements.siteFile, elements.siteFileName);
setupFileInput(elements.blockedFile, elements.blockedFileName);
setupWizard();
updateWizard();

function setupWizard() {
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = Number(button.dataset.stepTarget);
      if (target <= currentStep || canReachStep(target)) {
        goToStep(target);
      } else {
        setStatus("error", "Conclua as etapas anteriores antes de avançar.");
      }
    });
  });

  elements.backButton.addEventListener("click", () => goToStep(currentStep - 1));
  elements.nextButton.addEventListener("click", () => {
    if (validateStep(currentStep)) {
      goToStep(currentStep + 1);
    }
  });

  elements.blockedText.addEventListener("input", updateSummary);
  elements.modelSearch.addEventListener("input", () => {
    const exactMatch = siteModels.find((model) => normalizeLabel(model.name) === normalizeLabel(elements.modelSearch.value));
    elements.modelValue.value = exactMatch?.name || "";
    renderModelResults(elements.modelSearch.value);
    updateSummary();
    updateStepper();
    setStatus("", "");
  });
  elements.modelSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const firstMatch = findModelMatches(elements.modelSearch.value, 1)[0];
      if (firstMatch) {
        event.preventDefault();
        selectModel(firstMatch.name);
      }
    }
  });
  elements.modelSearch.addEventListener("focus", () => renderModelResults(elements.modelSearch.value));

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await generateWorkbook();
  });
}

function renderSizeInputs(container, sizes) {
  container.innerHTML = "";
  sizes.forEach((size) => {
    const label = document.createElement("label");
    label.className = "size-bubble";
    label.innerHTML = `
      <strong>${size}</strong>
      <input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-size="${size}">
      <small>meta</small>
    `;

    const input = label.querySelector("input");
    input.addEventListener("input", () => {
      label.classList.toggle("is-filled", toNumber(input.value) > 0);
      updateSummary();
      setStatus("", "");
    });
    input.addEventListener("focus", () => label.classList.add("is-focused"));
    input.addEventListener("blur", () => label.classList.remove("is-focused"));
    container.appendChild(label);
  });
}

function setupFileInput(input, label) {
  input.addEventListener("change", async () => {
    const card = input.closest(".upload-card");
    if (input.files.length) {
      label.textContent = input.files[0].name;
      card.classList.add("is-filled");
    } else {
      card.classList.remove("is-filled");
    }
    if (input === elements.siteFile) {
      await handleSiteFileChange();
    }
    updateSummary();
    updateStepper();
    if (input !== elements.siteFile) {
      setStatus("", "");
    }
  });
}

function goToStep(step) {
  currentStep = Math.max(1, Math.min(5, step));
  updateWizard();
  setStatus("", "");
}

function updateWizard() {
  document.querySelectorAll(".wizard-step").forEach((section) => {
    section.classList.toggle("is-active", Number(section.dataset.step) === currentStep);
  });
  elements.backButton.disabled = currentStep === 1;
  elements.nextButton.style.display = currentStep === 5 ? "none" : "inline-flex";
  updateStepper();
  updateSummary();
}

function updateStepper() {
  document.querySelectorAll("[data-step-target]").forEach((button) => {
    const step = Number(button.dataset.stepTarget);
    button.classList.toggle("is-active", step === currentStep);
    button.classList.toggle("is-done", step < currentStep && validateStep(step, false));
  });
}

function canReachStep(targetStep) {
  for (let step = 1; step < targetStep; step += 1) {
    if (!validateStep(step, false)) {
      return false;
    }
  }
  return true;
}

function validateStep(step, showMessage = true) {
  if (step === 1 && !elements.fabricFile.files.length) {
    if (showMessage) setStatus("error", "Envie o arquivo do estoque de tecido para continuar.");
    return false;
  }
  if (step === 2 && !elements.siteFile.files.length) {
    if (showMessage) setStatus("error", "Envie o arquivo do estoque do site para continuar.");
    return false;
  }
  if (step === 2 && !elements.modelValue.value) {
    if (showMessage) setStatus("error", "Selecione o modelo em Nome Estoque para continuar.");
    return false;
  }
  if (step === 3 && !readMetaEntries().length) {
    if (showMessage) setStatus("error", "Digite a meta de pelo menos um tamanho.");
    return false;
  }
  return true;
}

function readMetaEntries() {
  return Array.from(document.querySelectorAll("[data-size]"))
    .map((input) => ({
      Tamanho: input.dataset.size,
      Meta: niceNumber(input.value),
    }))
    .filter((row) => row.Meta > 0);
}

function updateSummary() {
  elements.summaryFabric.textContent = elements.fabricFile.files[0]?.name || "Aguardando arquivo";
  const selectedModel = elements.modelValue.value;
  if (elements.siteFile.files[0] && selectedModel) {
    elements.summarySite.textContent = `${elements.siteFile.files[0].name} | ${selectedModel}`;
  } else {
    elements.summarySite.textContent = elements.siteFile.files[0]?.name || "Aguardando arquivo";
  }

  const meta = readMetaEntries();
  const totalMeta = meta.reduce((total, row) => total + row.Meta, 0);
  elements.summaryMeta.textContent = meta.length
    ? `${meta.length} tamanhos preenchidos, total ${niceNumber(totalMeta)}`
    : "Nenhum tamanho preenchido";

  const blockedCount = readManualBlockedRows().length;
  const blockedFile = elements.blockedFile.files[0]?.name;
  if (blockedFile && blockedCount) {
    elements.summaryBlocked.textContent = `${blockedFile} + ${blockedCount} digitadas`;
  } else if (blockedFile) {
    elements.summaryBlocked.textContent = blockedFile;
  } else if (blockedCount) {
    elements.summaryBlocked.textContent = `${blockedCount} cores digitadas`;
  } else {
    elements.summaryBlocked.textContent = "Sem bloqueadas";
  }
}

async function generateWorkbook() {
  if (!canReachStep(5)) {
    setStatus("error", "Complete tecido, site e meta antes de gerar.");
    return;
  }

  try {
    ensureLibraries();
    elements.processButton.disabled = true;
    setStatus("loading", "Lendo arquivos e calculando reposição...");

    const fabricRows = await readUploadedTable(elements.fabricFile.files[0], "malha");
    const siteRows = await getSiteRows();
    const blockedRows = await readBlockedRows();
    const metaRows = readMetaEntries();

    const sheets = calculateReplacement(
      normalizeFabricStock(fabricRows),
      normalizeSiteStock(siteRows, elements.modelValue.value),
      normalizeTargetBySize(metaRows),
      normalizeBlockedColors(blockedRows),
      elements.modelValue.value,
    );

    exportWorkbook(sheets);
    setStatus("success", "Planilha gerada e baixada.");
  } catch (error) {
    setStatus("error", error.message || "Não foi possível gerar a planilha.");
  } finally {
    elements.processButton.disabled = false;
  }
}

async function handleSiteFileChange() {
  siteRowsCache = null;
  siteFileSignature = "";
  resetModelSelect("Lendo modelos do arquivo...");

  if (!elements.siteFile.files.length) {
    resetModelSelect("Envie o estoque do site para listar os modelos encontrados.");
    return;
  }

  try {
    ensureLibraries();
    const rows = await getSiteRows(true);
    const models = extractSiteModels(rows);
    populateModelSelect(models);
    setStatus("success", `${models.length} modelos encontrados em Nome Estoque.`);
  } catch (error) {
    resetModelSelect("Não consegui listar os modelos. Confira se existe a coluna Nome Estoque.");
    setStatus("error", error.message || "Não foi possível ler os modelos do estoque do site.");
  }
}

async function getSiteRows(forceReload = false) {
  const file = elements.siteFile.files[0];
  if (!file) {
    throw new Error("Envie o arquivo do estoque do site.");
  }

  const signature = `${file.name}|${file.size}|${file.lastModified}`;
  if (!forceReload && siteRowsCache && siteFileSignature === signature) {
    return siteRowsCache;
  }

  siteRowsCache = await readUploadedTable(file, "estoqueSite");
  siteFileSignature = signature;
  return siteRowsCache;
}

function resetModelSelect(message) {
  elements.modelPicker.hidden = false;
  siteModels = [];
  elements.modelSearch.value = "";
  elements.modelValue.value = "";
  elements.modelResults.innerHTML = "";
  elements.modelNotice.textContent = message;
}

function populateModelSelect(models) {
  elements.modelPicker.hidden = false;
  siteModels = models;
  elements.modelSearch.value = "";
  elements.modelValue.value = "";

  if (models.length === 1) {
    selectModel(models[0].name);
  } else {
    renderModelResults("");
  }

  elements.modelNotice.textContent =
    models.length === 1
      ? "Um modelo encontrado e selecionado automaticamente."
      : `${models.length} modelos encontrados. Escolha qual será reposto.`;
  updateSummary();
  updateStepper();
}

function renderModelResults(query) {
  const matches = findModelMatches(query, 60);

  elements.modelResults.innerHTML = "";
  if (!siteModels.length) {
    return;
  }

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "model-option";
    empty.textContent = "Nenhum modelo encontrado com esse texto";
    elements.modelResults.appendChild(empty);
    elements.modelNotice.textContent = "Digite outro trecho do Nome Estoque.";
    return;
  }

  matches.forEach((model) => {
    const option = document.createElement("button");
    option.className = "model-option";
    option.type = "button";
    option.classList.toggle("is-selected", elements.modelValue.value === model.name);
    option.innerHTML = `<span>${escapeHtml(model.name)}</span><small>${model.count} linhas</small>`;
    option.addEventListener("click", () => selectModel(model.name));
    elements.modelResults.appendChild(option);
  });

  elements.modelNotice.textContent =
    matches.length === siteModels.length
      ? `${siteModels.length} modelos encontrados. Digite para filtrar ou clique no modelo.`
      : `${matches.length} de ${siteModels.length} modelos encontrados para a busca.`;
}

function findModelMatches(query, limit = 60) {
  const normalizedQuery = normalizeLabel(query);
  return siteModels
    .filter((model) => !normalizedQuery || normalizeLabel(model.name).includes(normalizedQuery))
    .slice(0, limit);
}

function selectModel(modelName) {
  const model = siteModels.find((item) => item.name === modelName);
  elements.modelValue.value = modelName;
  elements.modelSearch.value = modelName;
  elements.modelResults.innerHTML = "";
  elements.modelNotice.textContent = model
    ? `Modelo selecionado: ${model.name} (${model.count} linhas).`
    : `Modelo selecionado: ${modelName}.`;
  updateSummary();
  updateStepper();
  setStatus("", "");
}

function extractSiteModels(rows) {
  const modelColumn = findColumn(rows, MODEL_ALIASES, "estoque do site", true);
  const counts = new Map();

  rows.forEach((row) => {
    const model = cleanText(row[modelColumn]);
    if (model) {
      counts.set(model, (counts.get(model) || 0) + 1);
    }
  });

  const models = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!models.length) {
    throw new Error("A coluna Nome Estoque não possui modelos preenchidos.");
  }
  return models;
}

async function readBlockedRows() {
  const rows = [];
  if (elements.blockedFile.files.length) {
    rows.push(...(await readUploadedTable(elements.blockedFile.files[0], "bloqueadas")));
  }
  rows.push(...readManualBlockedRows());
  return rows;
}

function readManualBlockedRows() {
  return elements.blockedText.value
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((color) => ({ Cor: color }));
}

function ensureLibraries() {
  if (!window.XLSX) {
    throw new Error("Biblioteca de planilhas não carregou. Verifique sua conexão e recarregue a página.");
  }
}

async function readUploadedTable(file, kind) {
  if (!file) {
    throw new Error("Arquivo não enviado.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "csv") {
    return tableFromRows(parseDelimitedRows(await file.text()));
  }
  if (["xls", "xlsx", "xlsm"].includes(extension)) {
    return readWorkbook(await file.arrayBuffer());
  }
  if (extension === "pdf") {
    return readPdf(await file.arrayBuffer(), file.name);
  }
  if (extension === "png") {
    return readImage(file, kind);
  }
  throw new Error(`Arquivo não suportado: ${file.name}. Envie PDF, XLS, XLSX, CSV ou PNG.`);
}

function readWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const allRows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
    const table = rows.filter((row) => row.some((cell) => cleanText(cell)));
    if (table.length) {
      allRows.push(...table);
    }
  });

  return tableFromRows(allRows);
}

async function readPdf(buffer, filename) {
  if (!window.pdfjsLib) {
    throw new Error("Biblioteca de PDF não carregou. Verifique sua conexão e recarregue a página.");
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const text = await page.getTextContent();
    rows.push(...rowsFromPdfItems(text.items));
  }

  if (rows.length < 2) {
    throw new Error(`O PDF ${filename} não possui tabela extraível. Envie CSV/XLSX ou um PNG nítido.`);
  }

  return tableFromRows(rows);
}

async function readImage(file, kind) {
  if (!window.Tesseract) {
    throw new Error("Biblioteca de OCR não carregou. Verifique sua conexão e recarregue a página.");
  }

  setStatus("loading", `Lendo PNG por OCR: ${file.name}`);
  const result = await Tesseract.recognize(file, "por+eng", {
    ...TESSERACT_OPTIONS,
    logger(message) {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        setStatus("loading", `Lendo PNG por OCR... ${Math.round(message.progress * 100)}%`);
      }
    },
  });

  return tableFromRows(rowsFromOcrText(result.data.text, file.name, kind));
}

function rowsFromPdfItems(items) {
  const parsed = items
    .map((item) => ({
      text: cleanText(item.str),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
    }))
    .filter((item) => item.text);

  const grouped = [];
  parsed.forEach((item) => {
    let row = grouped.find((entry) => Math.abs(entry.y - item.y) < 3);
    if (!row) {
      row = { y: item.y, items: [] };
      grouped.push(row);
    }
    row.items.push(item);
  });

  return grouped
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const cells = [];
      let current = "";
      let lastEnd = null;
      row.items
        .sort((a, b) => a.x - b.x)
        .forEach((item) => {
          const gap = lastEnd === null ? 0 : item.x - lastEnd;
          if (gap > 18 && current) {
            cells.push(current.trim());
            current = item.text;
          } else {
            current = current ? `${current} ${item.text}` : item.text;
          }
          lastEnd = item.x + item.width;
        });
      if (current) {
        cells.push(current.trim());
      }
      return cells;
    })
    .filter((row) => row.some((cell) => cleanText(cell)));
}

function rowsFromOcrText(text, filename, kind) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeOcrLine(line))
    .filter(Boolean);

  if (!lines.length) {
    throw new Error(`O PNG ${filename} não possui texto legível para OCR.`);
  }

  const structuredRows = rowsFromStructuredOcrLines(lines);
  if (tableLooksUseful(structuredRows, kind)) {
    return structuredRows;
  }

  const looseRows = rowsFromLooseOcrLines(lines, kind);
  if (kind === "bloqueadas" && looseRows.length === 1) {
    return looseRows;
  }
  if (looseRows.length < 2) {
    throw new Error(
      `Não consegui identificar uma tabela no PNG ${filename}. Use uma imagem nítida com cabeçalhos visíveis ou envie CSV/XLSX.`,
    );
  }
  return looseRows;
}

function rowsFromStructuredOcrLines(lines) {
  return lines
    .map((line) => splitOcrLine(line))
    .filter((row) => row.length > 1 && row.some((cell) => cleanText(cell)));
}

function splitOcrLine(line) {
  if (/[;\t|]/.test(line)) {
    return line.split(/[;\t|]+/).map((cell) => cleanText(cell)).filter(Boolean);
  }
  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((cell) => cleanText(cell)).filter(Boolean);
  }
  return [line];
}

function tableLooksUseful(rows, kind) {
  if (rows.length < 2) {
    return false;
  }

  const header = rows[0].join(" ");
  const normalizedHeader = normalizeLabel(header);
  const sizes = extractSizes(header);

  if (kind === "estoqueSite" && sizes.length > 1) {
    return true;
  }
  if (kind === "bloqueadas" && normalizedHeader.includes("cor")) {
    return true;
  }
  return (
    normalizedHeader.includes("cor") ||
    normalizedHeader.includes("tamanho") ||
    normalizedHeader.includes("estoque") ||
    normalizedHeader.includes("quantidade")
  );
}

function rowsFromLooseOcrLines(lines, kind) {
  const headerIndex = findOcrHeaderIndex(lines, kind);
  const headerLine = headerIndex >= 0 ? lines[headerIndex] : "";
  const dataLines = (headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines).filter((line) => !isProbablyHeader(line));

  if (kind === "bloqueadas") {
    return [["Cor"], ...dataLines.map((line) => [line])];
  }

  if (kind === "estoqueSite") {
    const sizes = extractSizes(headerLine);
    if (sizes.length > 1) {
      return [["Cor", ...sizes], ...dataLines.map((line) => parseColorWideLine(line, sizes.length)).filter(Boolean)];
    }
    return [["Cor", "Tamanho", "Estoque"], ...dataLines.map(parseColorSizeNumberLine).filter(Boolean)];
  }

  const fabricRows = dataLines.map(parseColorNumberLine).filter(Boolean);
  if (fabricRows.length) {
    return [["Cor", "Quantidade"], ...fabricRows];
  }
  return [["Cor"], ...dataLines.map((line) => [line])];
}

function findOcrHeaderIndex(lines, kind) {
  return lines.slice(0, 10).findIndex((line) => {
    const label = normalizeLabel(line);
    const sizes = extractSizes(line);
    if (kind === "estoqueSite") {
      return label.includes("cor") || label.includes("estoque") || label.includes("tamanho") || sizes.length > 1;
    }
    if (kind === "bloqueadas") {
      return label.includes("cor") || label.includes("bloque");
    }
    return label.includes("cor") || label.includes("quantidade") || label.includes("dispon");
  });
}

function parseColorNumberLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const numberIndex = findLastIndex(tokens, (token) => hasNumber(token));
  if (numberIndex <= 0) {
    return null;
  }
  return [tokens.slice(0, numberIndex).join(" "), tokens[numberIndex]];
}

function parseColorSizeNumberLine(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const numberIndex = findLastIndex(tokens, (token) => hasNumber(token));
  if (numberIndex <= 1) {
    return null;
  }

  let sizeIndex = -1;
  for (let index = numberIndex - 1; index >= 0; index -= 1) {
    if (isSizeHeader(tokens[index])) {
      sizeIndex = index;
      break;
    }
  }

  if (sizeIndex <= 0) {
    return null;
  }

  return [tokens.slice(0, sizeIndex).join(" "), normalizeSize(tokens[sizeIndex]), tokens[numberIndex]];
}

function parseColorWideLine(line, sizeCount) {
  const tokens = line.split(/\s+/).filter(Boolean);
  const valueIndexes = [];

  for (let index = tokens.length - 1; index >= 0 && valueIndexes.length < sizeCount; index -= 1) {
    if (hasNumber(tokens[index])) {
      valueIndexes.unshift(index);
    }
  }

  if (valueIndexes.length < sizeCount || valueIndexes[0] <= 0) {
    return null;
  }

  const color = tokens.slice(0, valueIndexes[0]).join(" ");
  const values = valueIndexes.map((index) => tokens[index]);
  return [color, ...values];
}

function parseDelimitedRows(text) {
  const content = text.replace(/^\uFEFF/, "").trim();
  if (!content) {
    return [];
  }

  const delimiter = detectDelimiter(content);
  return content
    .split(/\r?\n/)
    .filter((line) => cleanText(line))
    .map((line) => parseDelimitedLine(line, delimiter));
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [";", "\t", ","];
  return candidates
    .map((delimiter) => ({ delimiter, count: (sample.match(new RegExp(escapeRegExp(delimiter), "g")) || []).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  cells.push(current.trim());
  return cells;
}

function tableFromRows(rows) {
  const cleanRows = rows
    .map((row) => row.map((cell) => cleanText(cell)))
    .filter((row) => row.some((cell) => cell));

  if (!cleanRows.length) {
    return [];
  }

  const headerIndex = cleanRows.findIndex((row) => row.filter(Boolean).length >= 1);
  const headers = dedupeHeaders(cleanRows[headerIndex]);
  return cleanRows.slice(headerIndex + 1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cleanText(row[index]);
    });
    return record;
  });
}

function calculateReplacement(fabric, siteStock, target, blocked, modelName = "") {
  if (!target.length) {
    throw new Error("A meta não possui tamanhos preenchidos.");
  }
  if (!siteStock.length) {
    throw new Error("O arquivo de estoque do site não possui estoque válido.");
  }

  const sizes = target.map((row) => row.size);
  const model = modelName || "Modelo selecionado";
  const fabricByKey = new Map(fabric.map((row) => [row.compareKey, row]));
  const blockedByKey = new Map(blocked.map((row) => [row.compareKey, row]));
  const siteByKey = new Map();
  const stockMap = new Map();

  siteStock.forEach((row) => {
    if (!siteByKey.has(row.compareKey)) {
      siteByKey.set(row.compareKey, row);
    }
    stockMap.set(`${row.compareKey}|${row.size}`, (stockMap.get(`${row.compareKey}|${row.size}`) || 0) + row.stock);
  });

  const finalRows = [];
  const blockedRows = [];
  const noFabricRows = [];
  const finalKeys = new Set(
    Array.from(siteByKey.keys()).filter((key) => {
      const fabricRow = fabricByKey.get(key);
      return fabricRow?.available && !blockedByKey.has(key);
    }),
  );

  finalKeys.forEach((key) => {
    const row = buildWideColorRow({
      model,
      color: siteByKey.get(key)?.color || fabricByKey.get(key)?.color || "",
      key,
      sizes,
      target,
      stockMap,
    });
    if (row["Total Repor"] > 0) {
      finalRows.push(row);
    }
  });

  siteByKey.forEach((siteColor, key) => {
    const row = buildWideColorRow({ model, color: siteColor.color, key, sizes, target, stockMap });

    if (blockedByKey.has(key)) {
      blockedRows.push({
        Modelo: model,
        "Cor no site": siteColor.color,
        "Cor em estoque/lista": fabricByKey.get(key)?.color || blockedByKey.get(key)?.color || siteColor.color,
        Motivo: "Ja cortada/bloqueada",
        ...pickStockAndShortage(row, sizes, "Falta calculada"),
      });
      return;
    }

    const fabricRow = fabricByKey.get(key);
    if (!fabricRow?.available && row["Total Repor"] > 0) {
      noFabricRows.push({
        Modelo: model,
        "Cor no site": siteColor.color,
        ...pickStockAndShortage(row, sizes, "Falta"),
      });
    }
  });

  blocked.forEach((blockedColor) => {
    if (!siteByKey.has(blockedColor.compareKey)) {
      const row = buildWideColorRow({
        model,
        color: blockedColor.color,
        key: blockedColor.compareKey,
        sizes,
        target,
        stockMap,
      });
      blockedRows.push({
        Modelo: model,
        "Cor no site": "",
        "Cor em estoque/lista": blockedColor.color,
        Motivo: "Cor bloqueada informada",
        ...pickStockAndShortage(row, sizes, "Falta calculada"),
      });
    }
  });

  finalRows.sort((a, b) => String(a.Cor).localeCompare(String(b.Cor)));
  blockedRows.sort((a, b) =>
    String(a["Cor em estoque/lista"] || a["Cor no site"]).localeCompare(String(b["Cor em estoque/lista"] || b["Cor no site"])),
  );
  noFabricRows.sort((a, b) => String(a["Cor no site"]).localeCompare(String(b["Cor no site"])));

  return {
    "Reposição Final": finalRows,
    Resumo: buildSummarySheet({ model, finalRows, blockedRows, noFabricRows }),
    "Agrupado por Grade": buildGroupedByGrade(finalRows, sizes),
    "Excluídas já cortadas": blockedRows.filter((row) => row["Total falta calculada"] > 0),
    "Sem tecido disponível": noFabricRows.filter((row) => row["Total falta"] > 0),
    "Cores em estoque": fabric.map((row) => ({
      "Cor em estoque": row.color,
      "Chave de comparação": row.compareKey,
    })),
    Critérios: buildCriteriaSheet({ model, target, sizes }),
    __sizes: sizes,
  };
}

function normalizeFabricStock(rows) {
  const colorColumn = findColumn(rows, COLOR_ALIASES, "estoque de tecido", true);
  const quantityColumn = findColumn(rows, QUANTITY_ALIASES, "estoque de tecido", false);
  const grouped = new Map();

  rows.forEach((row) => {
    const color = cleanText(row[colorColumn]);
    const key = colorCompareKey(color);
    if (!key) return;

    const quantityValue = quantityColumn ? row[quantityColumn] : null;
    const numericQuantity = quantityColumn && hasNumber(quantityValue) ? toNumber(quantityValue) : null;
    const available = quantityColumn ? isAvailable(quantityValue) : true;
    const current = grouped.get(key) || {
      color,
      colorKey: colorKey(color),
      compareKey: key,
      quantity: null,
      available: false,
    };

    current.available = current.available || available;
    if (numericQuantity !== null) {
      current.quantity = (current.quantity || 0) + numericQuantity;
    }
    grouped.set(key, current);
  });

  const result = Array.from(grouped.values()).sort((a, b) => a.color.localeCompare(b.color));
  if (!result.length) {
    throw new Error("O arquivo de estoque de tecido não possui cores válidas.");
  }
  return result;
}

function normalizeSiteStock(rows, selectedModel = "") {
  const modelColumn = findColumn(rows, MODEL_ALIASES, "estoque do site", true);
  const colorColumn = findColumn(rows, COLOR_ALIASES, "estoque do site", true);
  const sizeColumn = findColumn(rows, SIZE_ALIASES, "estoque do site", true);
  const virtualQuantityColumn = findColumn(rows, VIRTUAL_QUANTITY_ALIASES, "estoque do site", true);
  const filteredRows = selectedModel
    ? rows.filter((row) => cleanText(row[modelColumn]) === selectedModel)
    : rows;
  const normalized = [];

  if (!filteredRows.length) {
    throw new Error("Nenhuma linha encontrada para o modelo selecionado em Nome Estoque.");
  }

  filteredRows.forEach((row) => {
    const color = cleanText(row[colorColumn]);
    normalized.push({
      color,
      colorKey: colorKey(color),
      compareKey: colorCompareKey(color),
      size: normalizeSize(row[sizeColumn]),
      stock: toNumber(row[virtualQuantityColumn]),
    });
  });

  const grouped = new Map();
  normalized.forEach((row) => {
    const key = row.compareKey;
    if (!key || !row.size) return;
    const mapKey = `${key}|${row.size}`;
    const current = grouped.get(mapKey) || {
      color: row.color,
      colorKey: row.colorKey,
      compareKey: key,
      size: row.size,
      stock: 0,
    };
    current.stock += row.stock;
    grouped.set(mapKey, current);
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const colorComparison = a.color.localeCompare(b.color);
    return colorComparison || sizeRank(a.size) - sizeRank(b.size);
  });
}

function normalizeTargetBySize(rows) {
  const sizeColumn = findColumn(rows, SIZE_ALIASES, "meta por tamanho", false);
  const targetColumn = findColumn(rows, unionSets(TARGET_ALIASES, QUANTITY_ALIASES), "meta por tamanho", false);
  const grouped = new Map();

  if (sizeColumn && targetColumn) {
    rows.forEach((row) => {
      const size = normalizeSize(row[sizeColumn]);
      const target = toNumber(row[targetColumn]);
      if (size && target > 0) {
        grouped.set(size, Math.max(grouped.get(size) || 0, target));
      }
    });
  } else {
    const sizeColumns = columnsOf(rows).filter((column) => isSizeHeader(column));
    if (!sizeColumns.length) {
      throw new Error("A meta precisa ter pelo menos um tamanho preenchido.");
    }
    sizeColumns.forEach((column) => {
      const size = normalizeSize(column);
      const target = rows.reduce((total, row) => total + toNumber(row[column]), 0);
      if (size && target > 0) {
        grouped.set(size, target);
      }
    });
  }

  return Array.from(grouped.entries())
    .map(([size, target]) => ({ size, target }))
    .sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
}

function normalizeBlockedColors(rows) {
  if (!rows.length) {
    return [];
  }

  const colorColumn = findColumn(rows, COLOR_ALIASES, "cores bloqueadas", false) || columnsOf(rows)[0];
  const seen = new Set();
  const blocked = [];

  rows.forEach((row) => {
    const color = cleanText(row[colorColumn]);
    const key = colorCompareKey(color);
    if (key && !seen.has(key)) {
      blocked.push({ color, colorKey: colorKey(color), compareKey: key });
      seen.add(key);
    }
  });

  return blocked;
}

function buildWideColorRow({ model, color, key, sizes, target, stockMap }) {
  const row = { Modelo: model, Cor: color };
  let total = 0;

  sizes.forEach((size) => {
    row[`Estoque ${size}`] = niceNumber(stockMap.get(`${key}|${size}`) || 0);
  });
  target.forEach((targetRow) => {
    row[`Meta ${targetRow.size}`] = niceNumber(targetRow.target);
  });
  target.forEach((targetRow) => {
    const currentStock = toNumber(row[`Estoque ${targetRow.size}`]);
    const replacement = Math.max(targetRow.target - currentStock, 0);
    row[`Repor ${targetRow.size}`] = niceNumber(replacement);
    total += replacement;
  });
  row["Total Repor"] = niceNumber(total);
  return row;
}

function pickStockAndShortage(row, sizes, shortagePrefix) {
  const output = {};
  let total = 0;
  sizes.forEach((size) => {
    output[`Estoque ${size}`] = row[`Estoque ${size}`] ?? 0;
  });
  sizes.forEach((size) => {
    const value = row[`Repor ${size}`] ?? 0;
    output[`${shortagePrefix} ${size}`] = value;
    total += toNumber(value);
  });
  output[`Total ${shortagePrefix.toLowerCase()}`] = niceNumber(total);
  return output;
}

function buildSummarySheet({ model, finalRows, blockedRows, noFabricRows }) {
  const totalPieces = finalRows.reduce((total, row) => total + toNumber(row["Total Repor"]), 0);
  return [
    { "Resumo da Avaliação": "Modelo", Valor: model },
    { "Resumo da Avaliação": "Cores para repor", Valor: finalRows.length },
    { "Resumo da Avaliação": "Peças totais a repor", Valor: niceNumber(totalPieces) },
    { "Resumo da Avaliação": "Cores bloqueadas/já cortadas", Valor: blockedRows.length },
    { "Resumo da Avaliação": "Cores com falta mas sem tecido", Valor: noFabricRows.length },
    {
      "Resumo da Avaliação": "Regra de cálculo",
      Valor: "Repor = MAX(Meta - Estoque, 0). Estoque negativo entra na conta.",
    },
    { "Resumo da Avaliação": "Tamanho equivalente", Valor: "XG foi tratado como G1 quando apareceu." },
    {
      "Resumo da Avaliação": "Filtro de tecido",
      Valor: "Só entram na reposição cores que existem no site, possuem tecido disponível e não estão bloqueadas.",
    },
  ];
}

function buildGroupedByGrade(finalRows, sizes) {
  const groups = new Map();
  finalRows.forEach((row) => {
    const values = sizes.map((size) => toNumber(row[`Repor ${size}`]));
    const key = values.join("|");
    const current = groups.get(key) || {
      values,
      total: toNumber(row["Total Repor"]),
      colors: [],
    };
    current.colors.push(row.Cor);
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .sort((a, b) => b.total - a.total || b.colors.length - a.colors.length)
    .map((group) => {
      const row = {};
      sizes.forEach((size, index) => {
        row[`Repor ${size}`] = niceNumber(group.values[index]);
      });
      row["Total por cor"] = niceNumber(group.total);
      row["Qtde cores"] = group.colors.length;
      row["Cores com a mesma grade"] = group.colors.sort((a, b) => a.localeCompare(b)).join(", ");
      return row;
    });
}

function buildCriteriaSheet({ model, target, sizes }) {
  return [
    { Critério: "Modelo", Valor: model },
    { Critério: "Meta", Valor: sizes.map((size) => `${size}: ${target.find((row) => row.size === size)?.target || 0}`).join(" / ") },
    { Critério: "Estoque usado", Valor: "Arquivo de estoque do site enviado no passo 2; coluna usada: Qtd.Virtual." },
    { Critério: "Cores em estoque", Valor: "Arquivo de estoque de tecido enviado no passo 1." },
    { Critério: "Cores bloqueadas", Valor: "Arquivo ou texto informado no passo 4." },
    { Critério: "Negativo", Valor: "Quantidade negativa no site entra na conta." },
    { Critério: "XG", Valor: "XG = G1." },
    { Critério: "Cálculo por tamanho", Valor: "MAX(meta - estoque, 0)." },
    {
      Critério: "Cores ausentes do site",
      Valor: "Cor que existe no tecido, mas não existe no site para o modelo escolhido, não entra na reposição.",
    },
  ];
}

function exportWorkbook(sheets) {
  const workbook = XLSX.utils.book_new();
  const sizes = sheets.__sizes || [];
  const finalHeaders = [
    "Modelo",
    "Cor",
    ...sizes.map((size) => `Estoque ${size}`),
    ...sizes.map((size) => `Meta ${size}`),
    ...sizes.map((size) => `Repor ${size}`),
    "Total Repor",
  ];
  const groupedHeaders = [
    ...sizes.map((size) => `Repor ${size}`),
    "Total por cor",
    "Qtde cores",
    "Cores com a mesma grade",
  ];
  const excludedHeaders = [
    "Modelo",
    "Cor no site",
    "Cor em estoque/lista",
    "Motivo",
    ...sizes.map((size) => `Estoque ${size}`),
    ...sizes.map((size) => `Falta calculada ${size}`),
    "Total falta calculada",
  ];
  const noFabricHeaders = [
    "Modelo",
    "Cor no site",
    ...sizes.map((size) => `Estoque ${size}`),
    ...sizes.map((size) => `Falta ${size}`),
    "Total falta",
  ];

  appendStyledSheet(workbook, "Reposição Final", sheets["Reposição Final"], finalHeaders, {
    widths: [18, 28, ...sizes.map(() => 11), ...sizes.map(() => 10), ...sizes.map(() => 10), 12],
  });
  appendStyledSheet(workbook, "Resumo", sheets.Resumo, ["Resumo da Avaliação", "Valor"], {
    widths: [26, 58],
  });
  appendStyledSheet(workbook, "Agrupado por Grade", sheets["Agrupado por Grade"], groupedHeaders, {
    widths: [...sizes.map(() => 10), 13, 12, 70],
    wrapColumns: [groupedHeaders.length - 1],
  });
  appendStyledSheet(workbook, "Excluídas já cortadas", sheets["Excluídas já cortadas"], excludedHeaders, {
    widths: [18, 28, 25, 18, ...sizes.map(() => 11), ...sizes.map(() => 17), 19],
  });
  appendStyledSheet(workbook, "Sem tecido disponível", sheets["Sem tecido disponível"], noFabricHeaders, {
    widths: [18, 28, ...sizes.map(() => 11), ...sizes.map(() => 10), 12],
  });
  appendStyledSheet(workbook, "Cores em estoque", sheets["Cores em estoque"], ["Cor em estoque", "Chave de comparação"], {
    widths: [30, 22],
  });
  appendStyledSheet(workbook, "Critérios", sheets.Critérios, ["Critério", "Valor"], {
    widths: [20, 72],
  });

  XLSX.writeFile(workbook, `reposicao-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function appendStyledSheet(workbook, name, rows, headers, options = {}) {
  const safeRows = rows.length ? rows : [];
  const aoa = [headers, ...safeRows.map((row) => headers.map((header) => row[header] ?? ""))];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = headers.map((header, index) => ({
    wch: options.widths?.[index] || Math.min(Math.max(String(header).length + 2, 12), 34),
  }));
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: headers.length - 1 } }),
  };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  styleWorksheet(worksheet, aoa.length, headers.length, options);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

function styleWorksheet(worksheet, rowCount, columnCount, options = {}) {
  const headerStyle = {
    fill: { fgColor: { rgb: "1F4E78" } },
    font: { bold: true, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const numberStyle = { numFmt: "0", alignment: { horizontal: "center" } };
  const textStyle = { alignment: { vertical: "top", wrapText: false } };
  const wrapSet = new Set(options.wrapColumns || []);

  for (let column = 0; column < columnCount; column += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: column });
    worksheet[cellRef].s = headerStyle;
  }

  for (let row = 1; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[cellRef];
      if (!cell) continue;
      cell.s =
        typeof cell.v === "number"
          ? numberStyle
          : { ...textStyle, alignment: { ...textStyle.alignment, wrapText: wrapSet.has(column) } };
    }
  }
}

function findColumn(rows, aliases, context, required) {
  const columns = columnsOf(rows);
  const normalizedAliases = Array.from(aliases).map((alias) => normalizeLabel(alias));

  let found = columns.find((column) => normalizedAliases.includes(normalizeLabel(column)));
  if (!found) {
    found = columns.find((column) => normalizedAliases.some((alias) => normalizeLabel(column).includes(alias)));
  }

  if (!found && required) {
    throw new Error(`Não encontrei a coluna esperada em ${context}. Colunas recebidas: ${columns.join(", ") || "nenhuma"}.`);
  }

  return found || null;
}

function columnsOf(rows) {
  const seen = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((column) => seen.add(column));
  });
  return Array.from(seen);
}

function normalizeSize(value) {
  const raw = stripAccents(cleanText(value)).toUpperCase();
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (["XG", "EXG", "EG", "G01"].includes(compact)) {
    return "G1";
  }
  if (ADULT_SIZES.includes(compact)) {
    return compact;
  }

  const kidsMatch = raw.match(/^(\d{1,2})(?:\s*ANOS?)?$/);
  if (kidsMatch && KIDS_SIZES.includes(kidsMatch[1])) {
    return kidsMatch[1];
  }

  return compact;
}

function isSizeHeader(value) {
  const size = normalizeSize(value);
  return Boolean(size) && SIZE_ORDER.includes(size);
}

function sizeRank(size) {
  const normalized = normalizeSize(size);
  const index = SIZE_ORDER.indexOf(normalized);
  return index >= 0 ? index : SIZE_ORDER.length + normalized.charCodeAt(0);
}

function extractSizes(line) {
  return line
    .split(/\s+/)
    .map((token) => normalizeSize(token))
    .filter((token) => isSizeHeader(token));
}

function isAvailable(value) {
  const label = normalizeLabel(value);
  if (hasNumber(value) && toNumber(value) > 0) {
    return true;
  }
  if (!label) {
    return false;
  }
  return !new Set(["0", "nao", "n", "no", "false", "falso", "indisponivel", "bloqueado", "sem"]).has(label);
}

function hasNumber(value) {
  return /-?\d/.test(cleanText(value));
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  let text = cleanText(value).replace(/[^0-9,.-]/g, "");
  if (!text || text === "-" || text === "," || text === ".") {
    return 0;
  }
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(",", ".");
  }
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : 0;
}

function niceNumber(value) {
  const number = toNumber(value);
  return Number.isInteger(number) ? number : Number(number.toFixed(2));
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function stripAccents(value) {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeLabel(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function colorKey(value) {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function colorCompareKey(value) {
  const text = stripAccents(value).toUpperCase();
  const numericCodes = text.match(/\b\d{3,5}\b/g);
  if (numericCodes?.length) {
    return numericCodes[numericCodes.length - 1];
  }
  return colorKey(text);
}

function normalizeOcrLine(line) {
  return cleanText(line.replace(/[¦|]/g, " | ").replace(/[“”]/g, '"'));
}

function isProbablyHeader(line) {
  const label = normalizeLabel(line);
  return (
    label.includes("cor") ||
    label.includes("tamanho") ||
    label.includes("estoque") ||
    label.includes("quantidade") ||
    label.includes("bloque")
  );
}

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((header, index) => {
    const base = cleanText(header) || `Coluna ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

function uniqueBy(rows, keyName) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row[keyName])) {
      return false;
    }
    seen.add(row[keyName]);
    return true;
  });
}

function uniqueObjects(rows, keys) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keys.map((field) => row[field]).join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function unionSets(...sets) {
  return new Set(sets.flatMap((set) => Array.from(set)));
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) {
      return index;
    }
  }
  return -1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(type, message) {
  elements.statusBox.className = "status";
  elements.statusBox.textContent = message;
  if (type && message) {
    elements.statusBox.classList.add("is-visible", `is-${type}`);
  }
}
