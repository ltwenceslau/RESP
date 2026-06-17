const STORAGE_KEY = "reposicaoEstoqueHtmlState";

const datasetLabels = {
  stock: "Estoque atual",
  site: "Cadastro do site",
  fabric: "Estoque de tecido",
};

const mappingLabels = {
  stock: { model: "Modelo", color: "Cor", size: "Tamanho", quantity: "Estoque" },
  site: { model: "Modelo", color: "Cor", size: "Tamanho", status: "Status" },
  fabric: { base: "Malha/Base", color: "Cor", quantity: "Quantidade" },
};

const defaultState = {
  config: {
    grades: {
      "T-shirt Tradicional": { P: 40, M: 90, G: 90, GG: 50, "XG/G1": 30, G2: 20, G3: 20 },
      "T-shirt Max": { P: 50, M: 100, G: 100, GG: 50, G1: 30, G2: 20, G3: 20 },
      "Camiseta Over": { P: 30, M: 60, G: 60, GG: 30, XG: 15 },
      "Cropped Max": { P: 30, M: 60, G: 60, GG: 30, G1: 10 },
    },
    modelBases: {
      "T-shirt Tradicional": "Malha Max/Select",
      "T-shirt Max": "Malha Max/Select",
      "Camiseta Over": "Malha Max/Select",
      "Cropped Max": "Malha Max/Select",
    },
    fabricBaseAliases: [
      { from: "Malha Max", to: "Malha Max/Select" },
      { from: "Malha Select", to: "Malha Max/Select" },
    ],
    colorAliases: [{ from: "Azul Marinho", to: "Azul Dark Blue" }],
    sizeGroups: {
      "T-shirt Tradicional": [{ name: "XG/G1", sizes: ["XG", "G1"] }],
    },
    settings: {
      excludeColorsNotOnSite: true,
      includeNegativeStock: true,
      ignoreInactiveSiteRows: true,
    },
  },
  datasets: {
    stock: blankDataset("stock"),
    site: blankDataset("site"),
    fabric: blankDataset("fabric"),
  },
  lastResult: null,
};

let state = loadState();
let result = state.lastResult;
let previewKind = "stock";

const $ = (selector) => document.querySelector(selector);

function blankDataset(kind) {
  return {
    kind,
    filename: "",
    columns: [],
    rows: [],
    mapping: defaultMapping(kind),
  };
}

function defaultMapping(kind) {
  if (kind === "stock") return { model: "", color: "", size: "", quantity: "" };
  if (kind === "site") return { model: "", color: "", size: "", status: "" };
  if (kind === "fabric") return { base: "", color: "", quantity: "" };
  return {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return clone(defaultState);
    const parsed = JSON.parse(saved);
    return {
      ...clone(defaultState),
      ...parsed,
      config: { ...clone(defaultState.config), ...(parsed.config || {}) },
      datasets: {
        stock: { ...blankDataset("stock"), ...(parsed.datasets?.stock || {}) },
        site: { ...blankDataset("site"), ...(parsed.datasets?.site || {}) },
        fabric: { ...blankDataset("fabric"), ...(parsed.datasets?.fabric || {}) },
      },
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  state.lastResult = result;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, tone = "success") {
  const box = $("#messageBox");
  box.textContent = text;
  box.className = `notice ${tone}`;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => box.classList.add("hidden"), 4500);
}

function cleanKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

function cleanText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
}

function numberValue(value) {
  if (typeof value === "number") return value;
  let text = cleanText(value).replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replaceAll(".", "").replace(",", ".")
      : text.replaceAll(",", "");
  } else if (text.includes(",")) {
    text = text.replaceAll(".", "").replace(",", ".");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayNumber(value) {
  return Math.abs(value - Math.round(value)) < 0.00001 ? Math.round(value) : Number(value.toFixed(2));
}

function resolveAlias(value, aliases) {
  const text = cleanText(value);
  const key = cleanKey(text);
  const match = (aliases || []).find((item) => cleanKey(item.from) === key);
  return match ? cleanText(match.to) : text;
}

function resolveModel(value) {
  const text = cleanText(value);
  const key = cleanKey(text);
  return Object.keys(state.config.grades).find((model) => cleanKey(model) === key) || text;
}

function sizeKeyFor(model, rawSize) {
  const text = cleanText(rawSize).toUpperCase();
  const textKey = cleanKey(text);
  for (const group of state.config.sizeGroups?.[model] || []) {
    if (cleanKey(group.name) === textKey) return cleanText(group.name).toUpperCase();
    if ((group.sizes || []).some((size) => cleanKey(size) === textKey)) {
      return cleanText(group.name).toUpperCase();
    }
  }
  return text;
}

function isSiteActive(value) {
  const key = cleanKey(value);
  if (!key) return true;
  return !["inativo", "inativa", "desativado", "desativada", "indisponivel", "false", "falso", "nao", "n", "0"].includes(key);
}

function datasetValue(row, mapping, field) {
  const column = mapping[field] || "";
  return row[column] ?? "";
}

function parseCsv(text) {
  const delimiter = (text.slice(0, 3000).match(/;/g) || []).length > (text.slice(0, 3000).match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cleanText(cell))) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.some((cell) => cleanText(cell))) rows.push(row);

  const headers = (rows.shift() || []).map((cell, index) => cleanText(cell) || `Coluna ${index + 1}`);
  const objects = rows.map((cells) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = cleanText(cells[index] ?? "");
    });
    return item;
  });
  return { columns: headers, rows: objects };
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    if (!window.XLSX) throw new Error("A biblioteca XLSX nao carregou. Verifique a internet ou envie CSV.");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows };
  }
  const text = await file.text();
  return parseCsv(text);
}

function guessMapping(kind, columns) {
  const synonyms = {
    model: ["modelo", "model", "produto", "product", "item", "descricao"],
    color: ["cor", "color", "cores"],
    size: ["tamanho", "tam", "size", "grade", "variacao"],
    quantity: ["estoque", "saldo", "qtd", "qtde", "quantidade", "quantity", "metros"],
    base: ["malha", "tecido", "base", "material", "fabric"],
    status: ["status", "ativo", "situacao", "publicado"],
  };
  const mapping = defaultMapping(kind);
  const keyedColumns = columns.map((column) => ({ column, key: cleanKey(column) }));
  for (const field of Object.keys(mapping)) {
    for (const synonym of synonyms[field] || []) {
      const synonymKey = cleanKey(synonym);
      const found = keyedColumns.find((item) => item.key === synonymKey || item.key.includes(synonymKey));
      if (found) {
        mapping[field] = found.column;
        break;
      }
    }
  }
  return mapping;
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${name}`));
}

function renderUploads() {
  for (const kind of Object.keys(datasetLabels)) {
    const dataset = state.datasets[kind];
    $(`#${kind}Meta`).textContent = dataset.filename ? `${dataset.filename} · ${dataset.rows.length} linhas` : "Nenhum arquivo carregado";
    renderMapping(kind);
  }
  renderPreview();
}

function renderMapping(kind) {
  const container = $(`#${kind}Mapping`);
  const dataset = state.datasets[kind];
  container.innerHTML = "";
  for (const [field, label] of Object.entries(mappingLabels[kind])) {
    const wrapper = document.createElement("label");
    wrapper.className = "mapping-field";
    const options = [`<option value="">Não usar</option>`].concat(
      dataset.columns.map((column) => `<option value="${escapeHtml(column)}" ${dataset.mapping[field] === column ? "selected" : ""}>${escapeHtml(column)}</option>`),
    );
    wrapper.innerHTML = `<span>${escapeHtml(label)}</span><select data-field="${field}">${options.join("")}</select>`;
    wrapper.querySelector("select").addEventListener("change", (event) => {
      dataset.mapping[field] = event.target.value;
      saveState();
      renderPreview();
    });
    container.appendChild(wrapper);
  }
}

function renderPreview() {
  const dataset = state.datasets[previewKind];
  $("#previewMeta").textContent = dataset.filename ? `${datasetLabels[previewKind]} · ${dataset.rows.length} linhas` : "Carregue um arquivo para visualizar as primeiras linhas";
  const table = $("#previewTable");
  if (!dataset.columns.length || !dataset.rows.length) {
    table.innerHTML = "<tbody><tr><td>Nenhuma prévia disponível.</td></tr></tbody>";
    return;
  }
  const columns = dataset.columns.slice(0, 8);
  const head = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = dataset.rows.slice(0, 10).map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("");
  table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

function renderSettings() {
  $("#excludeSiteToggle").checked = state.config.settings.excludeColorsNotOnSite;
  $("#negativeStockToggle").checked = state.config.settings.includeNegativeStock;
  $("#inactiveRowsToggle").checked = state.config.settings.ignoreInactiveSiteRows;
  renderGrades();
  renderAliases("#colorAliasesEditor", state.config.colorAliases);
  renderAliases("#baseAliasesEditor", state.config.fabricBaseAliases);
  renderModelBases();
  renderModelFilter();
}

function renderGrades() {
  const container = $("#gradesEditor");
  container.innerHTML = "";
  for (const model of Object.keys(state.config.grades)) {
    const block = document.createElement("section");
    block.className = "grade-block";
    const sizes = Object.entries(state.config.grades[model]).map(([size, quantity]) => `
      <div class="size-row" data-size="${escapeHtml(size)}">
        <div class="field"><label>Tamanho</label><input class="size-name" value="${escapeHtml(size)}" /></div>
        <div class="field"><label>Meta</label><input class="size-quantity" type="number" value="${escapeHtml(quantity)}" /></div>
        <button class="button danger remove-size" type="button">Remover</button>
      </div>
    `).join("");
    block.innerHTML = `
      <div class="grade-title">
        <input class="model-name" value="${escapeHtml(model)}" />
        <button class="button subtle add-size" type="button">Adicionar tamanho</button>
        <button class="button danger remove-model" type="button">Remover modelo</button>
      </div>
      <div class="size-grid">${sizes}</div>
    `;
    block.querySelector(".model-name").addEventListener("change", (event) => renameModel(model, event.target.value));
    block.querySelector(".add-size").addEventListener("click", () => {
      const name = `Novo ${Object.keys(state.config.grades[model]).length + 1}`;
      state.config.grades[model][name] = 0;
      saveState();
      renderSettings();
    });
    block.querySelector(".remove-model").addEventListener("click", () => {
      delete state.config.grades[model];
      delete state.config.modelBases[model];
      saveState();
      renderSettings();
    });
    block.querySelectorAll(".size-row").forEach((row) => {
      const oldSize = row.dataset.size;
      row.querySelector(".size-name").addEventListener("change", (event) => {
        const newSize = event.target.value.trim();
        if (!newSize || newSize === oldSize) return renderSettings();
        const value = state.config.grades[model][oldSize];
        delete state.config.grades[model][oldSize];
        state.config.grades[model][newSize] = value;
        saveState();
        renderSettings();
      });
      row.querySelector(".size-quantity").addEventListener("input", (event) => {
        state.config.grades[model][oldSize] = Number(event.target.value || 0);
        saveState();
      });
      row.querySelector(".remove-size").addEventListener("click", () => {
        delete state.config.grades[model][oldSize];
        saveState();
        renderSettings();
      });
    });
    container.appendChild(block);
  }
}

function renameModel(oldName, rawName) {
  const newName = rawName.trim();
  if (!newName || newName === oldName || state.config.grades[newName]) return renderSettings();
  state.config.grades[newName] = state.config.grades[oldName];
  delete state.config.grades[oldName];
  state.config.modelBases[newName] = state.config.modelBases[oldName] || "";
  delete state.config.modelBases[oldName];
  if (state.config.sizeGroups[oldName]) {
    state.config.sizeGroups[newName] = state.config.sizeGroups[oldName];
    delete state.config.sizeGroups[oldName];
  }
  saveState();
  renderSettings();
}

function renderAliases(selector, list) {
  const container = $(selector);
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = "<p>Nenhum alias cadastrado.</p>";
    return;
  }
  list.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "alias-row";
    row.innerHTML = `
      <div class="field"><label>De</label><input value="${escapeHtml(item.from)}" /></div>
      <div class="field"><label>Para</label><input value="${escapeHtml(item.to)}" /></div>
      <button class="button danger" type="button">Remover</button>
    `;
    const inputs = row.querySelectorAll("input");
    inputs[0].addEventListener("input", (event) => {
      item.from = event.target.value;
      saveState();
    });
    inputs[1].addEventListener("input", (event) => {
      item.to = event.target.value;
      saveState();
    });
    row.querySelector("button").addEventListener("click", () => {
      list.splice(index, 1);
      saveState();
      renderSettings();
    });
    container.appendChild(row);
  });
}

function renderModelBases() {
  const container = $("#modelBasesEditor");
  container.innerHTML = "";
  for (const model of Object.keys(state.config.grades)) {
    const row = document.createElement("label");
    row.className = "field";
    row.innerHTML = `<span>${escapeHtml(model)}</span><input value="${escapeHtml(state.config.modelBases[model] || "")}" />`;
    row.querySelector("input").addEventListener("input", (event) => {
      state.config.modelBases[model] = event.target.value;
      saveState();
    });
    container.appendChild(row);
  }
}

function renderModelFilter() {
  const current = $("#modelFilter").value;
  $("#modelFilter").innerHTML = `<option value="">Todos</option>` + Object.keys(state.config.grades).map((model) => (
    `<option value="${escapeHtml(model)}" ${current === model ? "selected" : ""}>${escapeHtml(model)}</option>`
  )).join("");
}

function buildIndexes() {
  const warnings = [];
  const stockIndex = {};
  const siteByModel = {};
  const fabricQty = {};
  const fabricColors = {};
  const settings = state.config.settings;

  for (const row of state.datasets.stock.rows) {
    const m = state.datasets.stock.mapping;
    const model = resolveModel(datasetValue(row, m, "model"));
    const color = resolveAlias(datasetValue(row, m, "color"), state.config.colorAliases);
    const size = sizeKeyFor(model, datasetValue(row, m, "size"));
    let qty = numberValue(datasetValue(row, m, "quantity"));
    if (!settings.includeNegativeStock) qty = Math.max(0, qty);
    if (!model || !color || !size) continue;
    const key = [cleanKey(model), cleanKey(color), cleanKey(size)].join("|");
    stockIndex[key] = (stockIndex[key] || 0) + qty;
  }

  let inactiveIgnored = 0;
  for (const row of state.datasets.site.rows) {
    const m = state.datasets.site.mapping;
    if (settings.ignoreInactiveSiteRows && m.status && !isSiteActive(datasetValue(row, m, "status"))) {
      inactiveIgnored += 1;
      continue;
    }
    const model = resolveModel(datasetValue(row, m, "model"));
    const color = resolveAlias(datasetValue(row, m, "color"), state.config.colorAliases);
    const rawSize = datasetValue(row, m, "size");
    const size = cleanText(rawSize) ? sizeKeyFor(model, rawSize) : "";
    if (!model || !color) continue;
    const modelKey = cleanKey(model);
    siteByModel[modelKey] = siteByModel[modelKey] || [];
    siteByModel[modelKey].push({ model, color, size });
  }
  if (inactiveIgnored) warnings.push(`${inactiveIgnored} linhas do site foram ignoradas por status inativo.`);

  for (const row of state.datasets.fabric.rows) {
    const m = state.datasets.fabric.mapping;
    const base = resolveAlias(datasetValue(row, m, "base"), state.config.fabricBaseAliases);
    const color = resolveAlias(datasetValue(row, m, "color"), state.config.colorAliases);
    const qty = numberValue(datasetValue(row, m, "quantity"));
    if (!base || !color) continue;
    const key = [cleanKey(base), cleanKey(color)].join("|");
    fabricQty[key] = (fabricQty[key] || 0) + qty;
    fabricColors[cleanKey(base)] = fabricColors[cleanKey(base)] || new Set();
    fabricColors[cleanKey(base)].add(cleanKey(color));
  }

  return { warnings, stockIndex, siteByModel, fabricQty, fabricColors };
}

function calculate() {
  const selectedModel = $("#modelFilter").value;
  const models = selectedModel ? [selectedModel] : Object.keys(state.config.grades);
  const { warnings, stockIndex, siteByModel, fabricQty, fabricColors } = buildIndexes();
  const rows = [];
  const excludedFabricColors = [];

  for (const model of models) {
    const grade = state.config.grades[model] || {};
    const modelKey = cleanKey(model);
    const siteRows = siteByModel[modelKey] || [];
    const candidates = {};

    if (state.config.settings.excludeColorsNotOnSite && siteRows.length) {
      for (const item of siteRows) {
        if (item.size && grade[item.size] !== undefined) {
          candidates[[cleanKey(item.color), cleanKey(item.size)].join("|")] = { color: item.color, size: item.size };
        } else if (!item.size) {
          for (const size of Object.keys(grade)) candidates[[cleanKey(item.color), cleanKey(size)].join("|")] = { color: item.color, size };
        }
      }
    } else {
      const stockColors = Object.keys(stockIndex)
        .map((key) => key.split("|"))
        .filter(([stockModel]) => stockModel === modelKey)
        .map(([, color]) => color);
      if (state.config.settings.excludeColorsNotOnSite && !siteRows.length && stockColors.length) {
        warnings.push(`${model}: nenhum cadastro de site foi encontrado; usei as cores do estoque atual como base.`);
      }
      for (const color of new Set(stockColors)) {
        for (const size of Object.keys(grade)) candidates[[color, cleanKey(size)].join("|")] = { color, size };
      }
    }

    const base = state.config.modelBases[model] || "";
    const baseKey = cleanKey(base);
    const candidateColorKeys = new Set(Object.keys(candidates).map((key) => key.split("|")[0]));
    if (state.config.settings.excludeColorsNotOnSite && siteRows.length) {
      for (const fabricColor of fabricColors[baseKey] || []) {
        if (!candidateColorKeys.has(fabricColor)) excludedFabricColors.push({ model, base, colorKey: fabricColor });
      }
    }

    for (const item of Object.values(candidates).sort((a, b) => `${a.color} ${a.size}`.localeCompare(`${b.color} ${b.size}`))) {
      const color = resolveAlias(item.color, state.config.colorAliases);
      const size = item.size;
      const ideal = numberValue(grade[size]);
      const current = stockIndex[[modelKey, cleanKey(color), cleanKey(size)].join("|")] || 0;
      const replenishment = Math.max(0, ideal - current);
      const availableFabric = base ? (fabricQty[[baseKey, cleanKey(color)].join("|")] || 0) : 0;
      const notes = [];
      if (state.datasets.fabric.rows.length && base && availableFabric <= 0) notes.push("Sem tecido informado");
      if (current < 0) notes.push("Estoque negativo considerado");
      rows.push({
        model,
        color,
        size,
        ideal: displayNumber(ideal),
        currentStock: displayNumber(current),
        replenishment: displayNumber(replenishment),
        fabricBase: base,
        fabricAvailable: displayNumber(availableFabric),
        status: replenishment <= 0 ? "OK" : notes.includes("Sem tecido informado") ? "Sem tecido" : "Repor",
        notes: notes.join("; "),
      });
    }
  }

  if (excludedFabricColors.length) {
    warnings.push(`${excludedFabricColors.length} cores com tecido foram excluidas por nao aparecerem no site do modelo.`);
  }

  const totalReplenishment = rows.reduce((sum, row) => sum + numberValue(row.replenishment), 0);
  const colorsToReplenish = new Set(rows.filter((row) => numberValue(row.replenishment) > 0).map((row) => `${row.model}|${row.color}`));
  result = {
    summary: {
      rows: rows.length,
      models: new Set(rows.map((row) => row.model)).size,
      colorsToReplenish: colorsToReplenish.size,
      totalReplenishment: displayNumber(totalReplenishment),
      noFabricRows: rows.filter((row) => row.status === "Sem tecido" && numberValue(row.replenishment) > 0).length,
    },
    rows,
    warnings: [...new Set(warnings)],
  };
  saveState();
  renderResult();
  setActiveTab("resultado");
  showMessage("Reposição calculada.");
}

function filteredRows() {
  const rows = result?.rows || [];
  const model = $("#modelFilter").value;
  const status = $("#statusFilter").value;
  const search = $("#searchInput").value.trim().toLowerCase();
  return rows.filter((row) => {
    if (model && row.model !== model) return false;
    if (status && row.status !== status) return false;
    if (search && !`${row.model} ${row.color} ${row.size} ${row.status} ${row.notes}`.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderResult() {
  const summary = result?.summary || {};
  const metrics = [
    ["Linhas", summary.rows || 0],
    ["Modelos", summary.models || 0],
    ["Cores a repor", summary.colorsToReplenish || 0],
    ["Peças a repor", summary.totalReplenishment || 0],
    ["Sem tecido", summary.noFabricRows || 0],
  ];
  $("#metricGrid").innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const rows = filteredRows();
  $("#resultMeta").textContent = result ? `${rows.length} linhas exibidas de ${result.rows.length}` : "Calcule para ver a reposição";
  $("#warningsPanel").classList.toggle("hidden", !(result?.warnings || []).length);
  $("#warningsList").innerHTML = (result?.warnings || []).map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");

  const table = $("#resultTable");
  if (!result) {
    table.innerHTML = "<tbody><tr><td>Nenhum cálculo executado.</td></tr></tbody>";
    return;
  }
  if (!rows.length) {
    table.innerHTML = "<tbody><tr><td>Nenhuma linha para os filtros atuais.</td></tr></tbody>";
    return;
  }
  const head = `
    <tr>
      <th>Modelo</th><th>Cor</th><th>Tamanho</th>
      <th class="number-cell">Ideal</th><th class="number-cell">Estoque</th><th class="number-cell">Repor</th>
      <th>Base</th><th class="number-cell">Tecido</th><th>Status</th><th>Notas</th>
    </tr>
  `;
  const body = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.color)}</td>
      <td>${escapeHtml(row.size)}</td>
      <td class="number-cell">${escapeHtml(row.ideal)}</td>
      <td class="number-cell">${escapeHtml(row.currentStock)}</td>
      <td class="number-cell"><strong>${escapeHtml(row.replenishment)}</strong></td>
      <td>${escapeHtml(row.fabricBase)}</td>
      <td class="number-cell">${escapeHtml(row.fabricAvailable)}</td>
      <td><span class="status ${row.status === "OK" ? "ok" : row.status === "Sem tecido" ? "sem-tecido" : "repor"}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.notes)}</td>
    </tr>
  `).join("");
  table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv() {
  if (!result?.rows?.length) {
    showMessage("Calcule antes de baixar o CSV.", "error");
    return;
  }
  const headers = ["model", "color", "size", "ideal", "currentStock", "replenishment", "fabricBase", "fabricAvailable", "status", "notes"];
  const lines = [headers.join(";")].concat(result.rows.map((row) => headers.map((header) => csvEscape(row[header])).join(";")));
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "reposicao.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function loadDemo() {
  state = clone(defaultState);
  state.datasets.stock = {
    kind: "stock",
    filename: "exemplo_estoque.xlsx",
    columns: ["Modelo", "Cor", "Tamanho", "Estoque"],
    mapping: { model: "Modelo", color: "Cor", size: "Tamanho", quantity: "Estoque" },
    rows: [
      { Modelo: "T-shirt Max", Cor: "Azul Marinho", Tamanho: "P", Estoque: 12 },
      { Modelo: "T-shirt Max", Cor: "Azul Marinho", Tamanho: "M", Estoque: -3 },
      { Modelo: "T-shirt Max", Cor: "Preto", Tamanho: "G", Estoque: 81 },
      { Modelo: "T-shirt Tradicional", Cor: "Preto", Tamanho: "XG", Estoque: 4 },
      { Modelo: "T-shirt Tradicional", Cor: "Preto", Tamanho: "G1", Estoque: 8 },
    ],
  };
  state.datasets.site = {
    kind: "site",
    filename: "exemplo_site.xlsx",
    columns: ["Modelo", "Cor", "Tamanho", "Status"],
    mapping: { model: "Modelo", color: "Cor", size: "Tamanho", status: "Status" },
    rows: [
      { Modelo: "T-shirt Max", Cor: "Azul Dark Blue", Tamanho: "P", Status: "Ativo" },
      { Modelo: "T-shirt Max", Cor: "Azul Dark Blue", Tamanho: "M", Status: "Ativo" },
      { Modelo: "T-shirt Max", Cor: "Preto", Tamanho: "G", Status: "Ativo" },
      { Modelo: "T-shirt Tradicional", Cor: "Preto", Tamanho: "XG", Status: "Ativo" },
      { Modelo: "T-shirt Tradicional", Cor: "Preto", Tamanho: "G1", Status: "Ativo" },
    ],
  };
  state.datasets.fabric = {
    kind: "fabric",
    filename: "exemplo_tecido.xlsx",
    columns: ["Malha", "Cor", "Quantidade"],
    mapping: { base: "Malha", color: "Cor", quantity: "Quantidade" },
    rows: [
      { Malha: "Malha Max", Cor: "Azul Dark Blue", Quantidade: 340 },
      { Malha: "Malha Select", Cor: "Preto", Quantidade: 220 },
      { Malha: "Malha Max", Cor: "Verde", Quantidade: 100 },
    ],
  };
  previewKind = "stock";
  result = null;
  saveState();
  renderAll();
  showMessage("Exemplo carregado.");
}

function renderAll() {
  renderUploads();
  renderSettings();
  renderResult();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.tab)));
  for (const kind of Object.keys(datasetLabels)) {
    document.querySelector(`[data-kind="${kind}"]`).addEventListener("click", () => {
      previewKind = kind;
      renderPreview();
    });
    $(`#${kind}File`).addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const parsed = await parseFile(file);
        state.datasets[kind] = {
          kind,
          filename: file.name,
          columns: parsed.columns,
          rows: parsed.rows,
          mapping: guessMapping(kind, parsed.columns),
        };
        previewKind = kind;
        result = null;
        saveState();
        renderAll();
        showMessage(`${parsed.rows.length} linhas importadas de ${file.name}.`);
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        event.target.value = "";
      }
    });
  }
  $("#saveButton").addEventListener("click", () => {
    saveState();
    showMessage("Regras salvas no navegador.");
  });
  $("#calculateButton").addEventListener("click", calculate);
  $("#demoButton").addEventListener("click", loadDemo);
  $("#downloadCsv").addEventListener("click", downloadCsv);
  $("#excludeSiteToggle").addEventListener("change", (event) => {
    state.config.settings.excludeColorsNotOnSite = event.target.checked;
    saveState();
  });
  $("#negativeStockToggle").addEventListener("change", (event) => {
    state.config.settings.includeNegativeStock = event.target.checked;
    saveState();
  });
  $("#inactiveRowsToggle").addEventListener("change", (event) => {
    state.config.settings.ignoreInactiveSiteRows = event.target.checked;
    saveState();
  });
  $("#addModelButton").addEventListener("click", () => {
    let index = 1;
    while (state.config.grades[`Novo modelo ${index}`]) index += 1;
    const model = `Novo modelo ${index}`;
    state.config.grades[model] = { P: 0, M: 0, G: 0 };
    state.config.modelBases[model] = "";
    saveState();
    renderSettings();
  });
  $("#addColorAliasButton").addEventListener("click", () => {
    state.config.colorAliases.push({ from: "", to: "" });
    saveState();
    renderSettings();
  });
  $("#addBaseAliasButton").addEventListener("click", () => {
    state.config.fabricBaseAliases.push({ from: "", to: "" });
    saveState();
    renderSettings();
  });
  $("#modelFilter").addEventListener("change", renderResult);
  $("#statusFilter").addEventListener("change", renderResult);
  $("#searchInput").addEventListener("input", renderResult);
}

bindEvents();
renderAll();
