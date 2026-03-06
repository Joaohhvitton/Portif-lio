window.APP_CONFIG = {
  supabaseUrl: "https://itgexftkwxgdqcvcoedh.supabase.co",
  supabaseAnonKey: "sb_publishable_fO8kHRJ31KJcfnwy_MEVrA_Ce5ZYu_y",
  tableName: "public.base_pix",
};

const STORAGE_KEY = "redeflex.demands.v1";

const config = window.APP_CONFIG || {};
const supabaseBaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
const hasRemoteConfig = Boolean(supabaseBaseUrl && config.supabaseAnonKey && config.tableName);

const storageBanner = document.getElementById("storageBanner");
const board = document.getElementById("board");
const demandTemplate = document.getElementById("demandTemplate");
const demandDialog = document.getElementById("demandDialog");
const detailsDialog = document.getElementById("detailsDialog");
const demandForm = document.getElementById("demandForm");
const detailsForm = document.getElementById("detailsForm");
const detailsTitle = document.getElementById("detailsTitle");
const detailsDescription = document.getElementById("detailsDescription");
const detailsStatusInput = document.getElementById("detailsStatusInput");
const detailsUpdateInput = document.getElementById("detailsUpdateInput");
const detailsMeta = document.getElementById("detailsMeta");
const systemInput = document.getElementById("systemInput");
const platformInput = document.getElementById("platformInput");
const platformSummary = document.getElementById("platformSummary");
const totalCount = document.getElementById("totalCount");
const progressCount = document.getElementById("progressCount");
const doneCount = document.getElementById("doneCount");

const tableTarget = resolveTablePath(config.tableName);

let demands = [];
let selectedDemandId = null;

const initialDemands = [
  {
    id: generateId(),
    title: "Ajustar conciliação instantânea",
    status: "Em Desenvolvimento",
    description: "Mapear divergências de retorno no processamento de QR dinâmico.",
    update: "Em refinamento com arquitetura.",
    produto: "Pix Cobrança",
    sistema: "Core Liquidação",
    plataforma: "API",
    squadTeam: "pix",
    prioridade: "P2_Media",
    type: "Melhoria",
    metodologia: "Kanban",
  },
  {
    id: generateId(),
    title: "Revisar fluxo de estorno PIX",
    status: "BackLog",
    description: "Documentar edge cases e regras do fluxo de devolução.",
    update: "Aguardando validação do negócio.",
    produto: "Pix Devolução",
    sistema: "Backoffice",
    plataforma: "Web",
    squadTeam: "pix",
    prioridade: "P1_Alta",
    type: "Projeto",
    metodologia: "Scrum",
  },
];

function resolveTablePath(rawTableName) {
  const value = String(rawTableName || "").trim();
  if (!value) return { schema: "public", table: "base_pix" };

  if (value.includes(".")) {
    const [schema, table] = value.split(".");
    return { schema, table };
  }

  return { schema: "public", table: value };
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function generatePrimaryKeyCandidate() {
  const seconds = Math.floor(Date.now() / 1000);
  const entropy = Math.floor(Math.random() * 1000);
  return seconds + entropy;
}


function normalizeStatus(rawStatus) {
  const value = String(rawStatus || "").trim().toLowerCase();
  const clean = value.normalize("NFD").replace(/[̀-ͯ]/g, "");

  if (["em refinamento", "refinamento", "em_refinamento"].includes(clean)) return "em_refinamento";
  if (["em desenvolvimento", "desenvolvimento", "em_desenvolvimento", "andamento", "em andamento"].includes(clean)) return "em_desenvolvimento";
  if (["homologacao", "homologação"].includes(clean)) return "homologacao";
  if (["teste qa", "teste_qa", "qa"].includes(clean)) return "teste_qa";
  if (["concluido", "concluida", "done", "finalizado", "finalizada"].includes(clean)) return "concluido";
  if (["impedido", "blocked", "bloqueado"].includes(clean)) return "impedido";
  return "backlog";
}

function statusToDatabaseValue(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "em_refinamento") return "Em Refinamento";
  if (normalized === "em_desenvolvimento") return "Em Desenvolvimento";
  if (normalized === "homologacao") return "Homologação";
  if (normalized === "teste_qa") return "Teste QA";
  if (normalized === "concluido") return "Concluido";
  if (normalized === "impedido") return "Impedido";
  return "BackLog";
}

function setBanner(text, isRemote) {
  storageBanner.textContent = text;
  storageBanner.classList.toggle("is-remote", isRemote);
}

function normalizeDemand(raw) {
  const logicalId = raw.id || raw.primari_key || generateId();
  const title = raw.title || raw.demanda || raw.produto || "Demanda sem título";
  const description = raw.description || raw.sistema || raw.plataforma || "Sem descrição";
  const update = raw.update || raw.atualizacao || "";

  return {
    id: String(logicalId),
    dbPrimaryKey: raw.primari_key ?? null,
    title,
    description,
    update,
    status: normalizeStatus(raw.status),
    produto: raw.produto || "-",
    sistema: raw.sistema || "-",
    plataforma: raw.plataforma || "-",
    squadTeam: raw.squad_team || "-",
    prioridade: raw.prioridade || "-",
    type: raw.type || "-",
    metodologia: raw.metodologia || "-",
    createdAt: raw.data_criacao || "-",
    updatedAt: raw.data_atualiza || "-",
  };
}

function buildAuthHeaders() {
  const key = String(config.supabaseAnonKey || "").trim();
  const headers = { apikey: key };

  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

async function requestSupabase(path, options = {}) {
  const response = await fetch(`${supabaseBaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...buildAuthHeaders(),
      "Accept-Profile": tableTarget.schema,
      "Content-Profile": tableTarget.schema,
      ...(options.headers || {}),
    },
  });

  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }

  const errorBody = await response.text();

  let details = errorBody || "sem detalhes";
  try {
    const parsed = JSON.parse(errorBody);
    details = parsed.message || parsed.error_description || parsed.details || errorBody;
  } catch (_) {
    // mantém texto bruto se não for JSON
  }

  throw new Error(`Supabase ${response.status}: ${details}`);
}

function formatRemoteError(error) {
  const msg = String(error?.message || "");

  if (msg.includes("404")) {
    return "Erro remoto (404): verifique supabaseUrl, tableName e schema.";
  }

  if (msg.includes("Invalid API key") || msg.includes("No API key found") || msg.includes("401") || msg.includes("JWT") || msg.includes("403 Forbidden")) {
    return "Erro de autenticação/chave: use a chave correta e ativa do projeto (anon JWT ou publishable key).";
  }

  if (msg.includes("403") || msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Erro de permissão: ajuste RLS/policies (SELECT/INSERT/UPDATE) para role anon.";
  }

  if (msg.includes("The schema must be one of") || msg.includes("schema")) {
    return "Schema não exposto: adicione o schema em Settings > API > Exposed schemas.";
  }

  if (msg.includes("Failed to fetch") || msg.includes("ERR_")) {
    return "Falha de conexão/CORS: confirme se o endpoint está acessível e liberado para a origem do site.";
  }

  return `Falha no remoto (${msg || "sem detalhe"}). Verifique URL, chave, schema exposto e políticas RLS.`;
}

async function remoteFetchDemands() {
  const rows = await requestSupabase(
    `${tableTarget.table}?select=primari_key,id,prioridade,produto,sistema,demanda,status,plataforma,squad_team,type,metodologia,atualizacao,data_criacao,data_atualiza&order=data_criacao.desc.nullslast,primari_key.desc`,
  );
  return rows.map(normalizeDemand);
}

async function remoteInsertDemand(demand) {
  const payload = {
    id: demand.id,
    prioridade: demand.prioridade || "-",
    demanda: demand.title,
    status: statusToDatabaseValue(demand.status),
    atualizacao: demand.update || "",
    data_criacao: new Date().toISOString().slice(0, 10),
    data_atualiza: new Date().toISOString().slice(0, 10),
    produto: demand.produto || "-",
    sistema: demand.sistema || demand.description || "-",
    plataforma: demand.plataforma || "-",
    squad_team: demand.squadTeam || "PIX",
    type: demand.type || "-",
    metodologia: demand.metodologia || "Kanban",
  };

  const sendInsert = async (candidatePayload) => requestSupabase(tableTarget.table, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([candidatePayload]),
  });

  try {
    const inserted = await sendInsert(payload);
    return normalizeDemand(inserted[0]);
  } catch (error) {
    const message = String(error?.message || "");
    const requiresPrimaryKey =
      message.includes("primari_key") &&
      (message.includes("null value") || message.includes("not-null") || message.includes("violates"));

    if (!requiresPrimaryKey) {
      throw error;
    }

    const payloadWithPrimaryKey = {
      ...payload,
      primari_key: generatePrimaryKeyCandidate(),
    };

    const inserted = await sendInsert(payloadWithPrimaryKey);
    return normalizeDemand(inserted[0]);
  }
}

async function remoteUpdateDemand(demand) {
  const filter =
    demand.dbPrimaryKey !== null && demand.dbPrimaryKey !== undefined
      ? `primari_key=eq.${encodeURIComponent(demand.dbPrimaryKey)}`
      : `id=eq.${encodeURIComponent(demand.id)}`;

  await requestSupabase(`${tableTarget.table}?${filter}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      atualizacao: demand.update,
      status: statusToDatabaseValue(demand.status),
      data_atualiza: new Date().toISOString().slice(0, 10),
    }),
  });
}

function loadLocalDemands() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const sanitized = parsed.map(normalizeDemand).filter((item) => item.id && item.title);
        if (sanitized.length) return sanitized;
      }
    } catch (error) {
      console.warn("LocalStorage inválido. Resetando dados locais.", error);
    }

    localStorage.removeItem(STORAGE_KEY);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialDemands));
  return initialDemands;
}

function persistLocalDemands() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(demands));
}

async function bootstrapDemands() {
  if (!hasRemoteConfig) {
    demands = loadLocalDemands();
    setBanner("Modo local: as atualizações ficam salvas apenas neste navegador.", false);
    return;
  }

  try {
    const remote = await remoteFetchDemands();
    demands = remote.length ? remote : [];

    if (!remote.length) {
      for (const demand of initialDemands) {
        await remoteInsertDemand(demand);
      }
      demands = await remoteFetchDemands();
    }

    setBanner("Modo remoto ativo: demandas e atualizações salvas no Supabase.", true);
  } catch (error) {
    demands = loadLocalDemands();
    setBanner(`${formatRemoteError(error)} (fallback local ativado)`, false);
    console.error(error);
  }
}

function translateStatus(status) {
  return statusToDatabaseValue(status);
}

function updateSummary() {
  totalCount.textContent = `${demands.length} demandas`;
  progressCount.textContent = `${demands.filter((item) => normalizeStatus(item.status) === "em_desenvolvimento").length} demandas`;
  doneCount.textContent = `${demands.filter((item) => normalizeStatus(item.status) === "concluido").length} demandas`;
}

function cleanDisplayText(value) {
  const raw = String(value || "-");
  if (!raw || raw === "-") return "-";

  return raw
    .split(",")
    .map((part) => part.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}

function cleanTitleText(value) {
  return cleanDisplayText(value).replace(/\bitau\b/gi, "Itaú");
}


function getPlatformOptionInputs() {
  return Array.from(document.querySelectorAll(".platform-option"));
}

function getSelectedPlatforms() {
  return getPlatformOptionInputs()
    .filter((item) => item.checked)
    .map((item) => item.value);
}

function refreshPlatformSummary() {
  const selected = getSelectedPlatforms();
  platformSummary.textContent = selected.length ? selected.join(", ") : "Selecione plataforma(s)";
}

function clearPlatformSelection() {
  for (const option of getPlatformOptionInputs()) {
    option.checked = false;
  }
  refreshPlatformSummary();
}

function renderMetaList(metaPairs) {
  return metaPairs.map(([label, value]) => `<dt>${label}</dt><dd>${value || "-"}</dd>`).join("");
}

function openDemandDetails(demand) {
  selectedDemandId = demand.id;
  detailsTitle.textContent = cleanTitleText(demand.title);
  detailsDescription.textContent = cleanDisplayText(demand.description);
  detailsStatusInput.value = normalizeStatus(demand.status);
  detailsUpdateInput.value = demand.update || "";
  detailsMeta.innerHTML = renderMetaList([
    ["ID lógico", demand.id],
    ["Primary key", demand.dbPrimaryKey],
    ["Prioridade", cleanDisplayText(demand.prioridade)],
    ["Produto", cleanDisplayText(demand.produto)],
    ["Sistema", cleanDisplayText(demand.sistema)],
    ["Plataforma", cleanDisplayText(demand.plataforma)],
    ["Squad", demand.squadTeam],
    ["Type", demand.type],
    ["Metodologia", demand.metodologia],
    ["Criada em", demand.createdAt],
    ["Atualizada em", demand.updatedAt],
  ]);
  detailsDialog.showModal();
}

function renderBoard() {
  board.innerHTML = "";

  if (!demands.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma demanda cadastrada para o Squad PIX.";
    board.appendChild(empty);
    return;
  }

  for (const demand of demands) {
    const node = demandTemplate.content.cloneNode(true);
    const card = node.querySelector(".card");
    const chip = node.querySelector(".chip");

    node.querySelector(".card-title").textContent = cleanTitleText(demand.title);
    node.querySelector(".card-description").textContent = cleanDisplayText(demand.description);

    const cardMeta = node.querySelector(".card-meta");
    cardMeta.innerHTML = [
      `<li><strong>Prioridade:</strong> ${cleanDisplayText(demand.prioridade)}</li>`,
      `<li><strong>Produto:</strong> ${cleanDisplayText(demand.produto)}</li>`,
      `<li><strong>Sistema:</strong> ${cleanDisplayText(demand.sistema)}</li>`,
      `<li><strong>Plataforma:</strong> ${cleanDisplayText(demand.plataforma)}</li>`,
    ].join("");

    const normalizedStatus = normalizeStatus(demand.status);
    chip.textContent = translateStatus(normalizedStatus);
    chip.classList.add(normalizedStatus);

    card.addEventListener("click", () => openDemandDetails(demand));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDemandDetails(demand);
      }
    });

    board.appendChild(node);
  }
}

document.getElementById("newDemandBtn").addEventListener("click", () => {
  demandDialog.showModal();
});

document.getElementById("cancelCreateBtn").addEventListener("click", () => {
  demandDialog.close();
});

document.getElementById("cancelDetailsBtn").addEventListener("click", () => {
  detailsDialog.close();
});

demandForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!getSelectedPlatforms().length) {
    setBanner("Selecione ao menos uma plataforma para criar a demanda.", false);
    return;
  }

  const demand = {
    id: document.getElementById("idInput").value.trim() || generateId(),
    title: document.getElementById("titleInput").value.trim(),
    description: document.getElementById("descriptionInput").value.trim() || systemInput.value || "-",
    status: document.getElementById("statusInput").value,
    update: "",
    prioridade: document.getElementById("priorityInput").value,
    produto: document.getElementById("productInput").value,
    sistema: systemInput.value,
    plataforma: getSelectedPlatforms().join(", ") || "-",
    squadTeam: document.getElementById("squadInput").value.trim() || "PIX",
    type: document.getElementById("typeInput").value,
    metodologia: document.getElementById("methodologyInput").value,
  };

  if (hasRemoteConfig) {
    try {
      const inserted = await remoteInsertDemand(demand);
      demands.unshift(inserted);
    } catch (error) {
      console.error(error);
      demands.unshift(normalizeDemand(demand));
      persistLocalDemands();
      setBanner(`Não foi possível criar no Supabase agora. Demanda salva localmente neste navegador. ${formatRemoteError(error)}`, false);
    }
  } else {
    demands.unshift(demand);
    persistLocalDemands();
  }

  updateSummary();
  renderBoard();
  demandForm.reset();
  clearPlatformSelection();
  demandDialog.close();
});

detailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const target = demands.find((item) => item.id === selectedDemandId);
  if (!target) return;

  target.status = detailsStatusInput.value;
  target.update = detailsUpdateInput.value.trim();
  target.updatedAt = new Date().toISOString().slice(0, 10);

  if (hasRemoteConfig) {
    try {
      await remoteUpdateDemand(target);
    } catch (error) {
      console.error(error);
      persistLocalDemands();
      setBanner(`Não foi possível atualizar no Supabase agora. Atualização salva localmente neste navegador. ${formatRemoteError(error)}`, false);
    }
  } else {
    persistLocalDemands();
  }

  updateSummary();
  renderBoard();
  detailsDialog.close();
});

(async function init() {
  for (const option of getPlatformOptionInputs()) {
    option.addEventListener("change", refreshPlatformSummary);
  }

  refreshPlatformSummary();
  setBanner("Conectando e carregando demandas...", false);
  await bootstrapDemands();
  updateSummary();
  renderBoard();
})();

