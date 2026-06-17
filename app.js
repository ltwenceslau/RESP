const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "G1", "G2", "G3", "G4", "G5"];
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

const inputs = {
  malha: document.getElementById("malha"),
  estoqueSite: document.getElementById("estoqueSite"),
  meta: document.getElementById("meta"),
  bloqueadas: document.getElementById("bloqueadas"),
};
const button = document.getElementById("processButton");
const statusBox = document.getElementById("status");

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

Object.entries(inputs).forEach(([id, input]) => {
  input.addEventListener("change", () => {
    const label = document.getElementById(`${id}Name`);
    const card = input.closest(".upload-card");
    if (input.files.length) {
      label.textContent = input.files[0].name;
      card.classList.add("is-filled");
    } else {
      card.classList.remove("is-filled");
    }
    setStatus("", "");
  });
});

document.getElementById("uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    ensureLibraries();
    button.disabled = true;
    setStatus("loading", "Lendo arquivos e calculando reposição...");

    const tables = {
      malha: await readUploadedTable(inputs.malha.files[0]),
      estoqueSite: await readUploadedTable(inputs.estoqueSite.files[0]),
      meta: await readUploadedTable(inputs.meta.files[0]),
      bloqueadas: await readUploadedTable(inputs.bloqueadas.files[0]),
    };

    const sheets = calculateReplacement(
      normalizeFabricStock(tables.malha),
      normalizeSiteStock(tables.estoqueSite),
      normalizeTargetBySize(tables.meta),
      normalizeBlockedColors(tables.bloqueadas),
    );

    exportWorkbook(sheets);
    setStatus("success", "Planilha gerada e baixada.");
  } catch (error) {
    setStatus("error", error.message || "Não foi possível gerar a planilha.");
  } finally {
    button.disabled = false;
  }
});

function ensureLibraries() {
  if (!window.XLSX) {
    throw new Error("Biblioteca de planilhas não carregou. Verifique sua conexão e recarregue a página.");
  }
  if (!window.pdfjsLib) {
    throw new Error("Biblioteca de PDF não carregou. Verifique sua conexão e recarregue a página.");
  }
}

async function readUploadedTable(file) {
  if (!file) {
    throw new Error("Envie todos os quatro arquivos antes de gerar a planilha.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "csv") {
    return tableFromRows(parseDelimitedRows(await file.text()));
  }
  if (extension === "xlsx" || extension === "xlsm") {
    return readWorkbook(await file.arrayBuffer());
  }
  if (extension === "pdf") {
    return readPdf(await file.arrayBuffer(), file.name);
  }
  throw new Error(`Arquivo não suportado: ${file.name}. Envie PDF, XLSX ou CSV.`);
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
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const text = await page.getTextContent();
    rows.push(...rowsFromPdfItems(text.items));
  }

  if (rows.length < 2) {
    throw new Error(`O PDF ${filename} não possui tabela extraível. Exporte esse relatório como CSV ou XLSX.`);
  }

  return tableFromRows(rows);
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

  if (cleanRows.length < 1) {
    throw new Error("Arquivo sem dados válidos.");
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

function calculateReplacement(fabric, siteStock, target, blocked) {
  if (!target.length) {
    throw new Error("O arquivo de meta não possui tamanhos e metas válidas.");
  }
  if (!siteStock.length) {
    throw new Error("O arquivo de estoque do site não possui estoque válido.");
  }

  const fabricByKey = new Map(fabric.map((row) => [row.colorKey, row]));
  const blockedKeys = new Set(blocked.map((row) => row.colorKey));
  const siteColors = uniqueBy(siteStock, "colorKey").sort((a, b) => a.color.localeCompare(b.color));
  const stockMap = new Map(siteStock.map((row) => [`${row.colorKey}|${row.size}`, row.stock]));

  const replacement = [];
  const audit = [];
  const excluded = [];

  siteColors.forEach((siteColor) => {
    const fabricRow = fabricByKey.get(siteColor.colorKey);

    if (blockedKeys.has(siteColor.colorKey)) {
      excluded.push({ Cor: siteColor.color, Motivo: "Cor bloqueada para corte", Origem: "Estoque do site" });
      return;
    }

    if (!fabricRow || !fabricRow.available) {
      excluded.push({ Cor: siteColor.color, Motivo: "Sem malha disponível", Origem: "Estoque do site" });
      return;
    }

    target.forEach((targetRow) => {
      const currentStock = stockMap.get(`${siteColor.colorKey}|${targetRow.size}`) || 0;
      const quantity = Math.max(targetRow.target - currentStock, 0);
      const row = {
        Cor: siteColor.color,
        Tamanho: targetRow.size,
        "Estoque atual": niceNumber(currentStock),
        Meta: niceNumber(targetRow.target),
        Reposição: niceNumber(quantity),
        "Malha disponível": fabricRow.quantity === null ? "Sim" : niceNumber(fabricRow.quantity),
      };
      audit.push({ ...row, Status: "Reposição calculada" });
      if (quantity > 0) {
        replacement.push(row);
      }
    });
  });

  const siteColorKeys = new Set(siteColors.map((row) => row.colorKey));
  fabric.forEach((fabricRow) => {
    if (!siteColorKeys.has(fabricRow.colorKey) && !blockedKeys.has(fabricRow.colorKey)) {
      excluded.push({ Cor: fabricRow.color, Motivo: "Cor não existe no site", Origem: "Estoque de malha" });
    }
  });

  blocked.forEach((blockedRow) => {
    if (!siteColorKeys.has(blockedRow.colorKey)) {
      excluded.push({ Cor: blockedRow.color, Motivo: "Cor bloqueada informada", Origem: "Bloqueadas" });
    }
  });

  const excludedUnique = uniqueObjects(excluded, ["Cor", "Motivo", "Origem"]);
  return {
    Resumo: buildSummary(replacement, excludedUnique),
    Reposicao: replacement,
    "Grade por cor": buildPivot(replacement),
    Auditoria: audit,
    Excluidas: excludedUnique,
  };
}

function normalizeFabricStock(rows) {
  const colorColumn = findColumn(rows, COLOR_ALIASES, "estoque de malha", true);
  const quantityColumn = findColumn(rows, QUANTITY_ALIASES, "estoque de malha", false);
  const grouped = new Map();

  rows.forEach((row) => {
    const color = cleanText(row[colorColumn]);
    const colorKeyValue = colorKey(color);
    if (!colorKeyValue) return;

    const quantityValue = quantityColumn ? row[quantityColumn] : null;
    const numericQuantity = quantityColumn && hasNumber(quantityValue) ? toNumber(quantityValue) : null;
    const available = quantityColumn ? isAvailable(quantityValue) : true;
    const current = grouped.get(colorKeyValue) || {
      color,
      colorKey: colorKeyValue,
      quantity: null,
      available: false,
    };

    current.available = current.available || available;
    if (numericQuantity !== null) {
      current.quantity = (current.quantity || 0) + numericQuantity;
    }
    grouped.set(colorKeyValue, current);
  });

  const result = Array.from(grouped.values()).sort((a, b) => a.color.localeCompare(b.color));
  if (!result.length) {
    throw new Error("O arquivo de estoque de malha não possui cores válidas.");
  }
  return result;
}

function normalizeSiteStock(rows) {
  const colorColumn = findColumn(rows, COLOR_ALIASES, "estoque do site", true);
  const sizeColumn = findColumn(rows, SIZE_ALIASES, "estoque do site", false);
  const quantityColumn = findColumn(rows, QUANTITY_ALIASES, "estoque do site", false);
  const normalized = [];

  if (sizeColumn && quantityColumn) {
    rows.forEach((row) => {
      normalized.push({
        color: cleanText(row[colorColumn]),
        size: normalizeSize(row[sizeColumn]),
        stock: toNumber(row[quantityColumn]),
      });
    });
  } else {
    const sizeColumns = columnsOf(rows).filter((column) => column !== colorColumn && isSizeHeader(column));
    if (!sizeColumns.length) {
      throw new Error("O estoque do site precisa ter Cor, Tamanho e Estoque, ou uma grade com uma coluna por tamanho.");
    }
    rows.forEach((row) => {
      sizeColumns.forEach((column) => {
        normalized.push({
          color: cleanText(row[colorColumn]),
          size: normalizeSize(column),
          stock: toNumber(row[column]),
        });
      });
    });
  }

  const grouped = new Map();
  normalized.forEach((row) => {
    const key = colorKey(row.color);
    if (!key || !row.size) return;
    const mapKey = `${key}|${row.size}`;
    const current = grouped.get(mapKey) || { color: row.color, colorKey: key, size: row.size, stock: 0 };
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
      throw new Error("A meta precisa ter Tamanho/Meta ou uma grade com uma coluna por tamanho.");
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
    const key = colorKey(color);
    if (key && !seen.has(key)) {
      blocked.push({ color, colorKey: key });
      seen.add(key);
    }
  });

  return blocked;
}

function buildPivot(replacement) {
  const byColor = new Map();
  replacement.forEach((row) => {
    const current = byColor.get(row.Cor) || { Cor: row.Cor };
    current[row.Tamanho] = (current[row.Tamanho] || 0) + toNumber(row.Reposição);
    byColor.set(row.Cor, current);
  });

  const sizes = Array.from(new Set(replacement.map((row) => row.Tamanho))).sort((a, b) => sizeRank(a) - sizeRank(b));
  return Array.from(byColor.values()).map((row) => {
    let total = 0;
    sizes.forEach((size) => {
      row[size] = niceNumber(row[size] || 0);
      total += toNumber(row[size]);
    });
    row.Total = niceNumber(total);
    return row;
  });
}

function buildSummary(replacement, excluded) {
  const totalPieces = replacement.reduce((total, row) => total + toNumber(row.Reposição), 0);
  const colors = new Set(replacement.map((row) => row.Cor)).size;
  return [
    { Indicador: "Peças para repor", Valor: niceNumber(totalPieces) },
    { Indicador: "Cores com reposição", Valor: colors },
    { Indicador: "Linhas de reposição", Valor: replacement.length },
    { Indicador: "Cores/linhas excluídas", Valor: excluded.length },
  ];
}

function exportWorkbook(sheets) {
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, "Resumo", sheets.Resumo, ["Indicador", "Valor"]);
  appendSheet(workbook, "Reposicao", sheets.Reposicao, [
    "Cor",
    "Tamanho",
    "Estoque atual",
    "Meta",
    "Reposição",
    "Malha disponível",
  ]);

  const pivotHeaders = columnsOf(sheets["Grade por cor"]);
  appendSheet(workbook, "Grade por cor", sheets["Grade por cor"], pivotHeaders.length ? pivotHeaders : ["Cor", "Total"]);
  appendSheet(workbook, "Auditoria", sheets.Auditoria, [
    "Cor",
    "Tamanho",
    "Estoque atual",
    "Meta",
    "Reposição",
    "Malha disponível",
    "Status",
  ]);
  appendSheet(workbook, "Excluidas", sheets.Excluidas, ["Cor", "Motivo", "Origem"]);

  XLSX.writeFile(workbook, `reposicao-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function appendSheet(workbook, name, rows, headers) {
  const aoa = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!cols"] = headers.map((header, columnIndex) => ({
    wch: Math.min(
      Math.max(
        String(header).length + 2,
        ...rows.map((row) => String(row[headers[columnIndex]] ?? "").length + 2),
        12,
      ),
      34,
    ),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
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
  const token = stripAccents(cleanText(value)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["XG", "EXG", "EG", "G01"].includes(token)) {
    return "G1";
  }
  return token;
}

function isSizeHeader(value) {
  const size = normalizeSize(value);
  return Boolean(size) && (SIZE_ORDER.includes(size) || /^G[1-9]$/.test(size) || /^[0-9]{1,2}$/.test(size));
}

function sizeRank(size) {
  const normalized = normalizeSize(size);
  const index = SIZE_ORDER.indexOf(normalized);
  return index >= 0 ? index : SIZE_ORDER.length + normalized.charCodeAt(0);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setStatus(type, message) {
  statusBox.className = "status";
  statusBox.textContent = message;
  if (type && message) {
    statusBox.classList.add("is-visible", `is-${type}`);
  }
}
