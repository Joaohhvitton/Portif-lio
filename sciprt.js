window.APP_CONFIG = {
  supabaseUrl: "https://itgexftkwxgdqcvcoedh.supabase.co",
  supabaseAnonKey: "sb_publishable_fO8kHRJ31KJcfnwy_MEVrA_Ce5ZY...",
  tableName: "base_pix",
  schema: "public",
};

const STORAGE_KEY = "redeflex_pix_demands";

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const board = document.getElementById("board");
const demandTemplate = document.getElementById("demandTemplate");
const demandDialog = document.getElementById("demandDialog");
const demandForm = document.getElementById("demandForm");
const detailsDialog = document.getElementById("detailsDialog");
const detailsForm = document.getElementById("detailsForm");
const detailsTitle = document.getElementById("detailsTitle");
const detailsDescription = document.getElementById("detailsDescription");
const detailsStatusInput = document.getElementById("detailsStatusInput");
const detailsUpdateInput = document.getElementById("detailsUpdateInput");
const totalCount = document.getElementById("totalCount");
const progressCount = document.getElementById("progressCount");
const doneCount = document.getElementById("doneCount");
const storageBanner = document.getElementById("storageBanner");

const config = window.APP_CONFIG || {};
const tableName = config.tableName || "demands";
const schemaName = config.schema || "public";

function normalizeSupabaseUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

const supabaseBaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
const hasRemoteConfig = Boolean(supabaseBaseUrl && config.supabaseAnonKey);

function resolveTablePath(name) {
  if (!name) return { schema: schemaName, table: "demands" };
  if (name.includes(".")) {
    const [schema, table] = name.split(".");
    return { schema, table };
  }
  return { schema: schemaName, table: name };
}

const tableTarget = resolveTablePath(tableName);

let demands = [];
let selectedDemandId = null;

const initialDemands = [
  {
    id: generateId(),
    title: "Ajustar conciliação instantânea",
    status: "andamento",
    description: "Mapear divergências de retorno no processamento de QR dinâmico.",
    update: "Em refinamento com arquitetura.",
  },
  {
    id: generateId(),
    title: "Revisar fluxo de estorno PIX",
    status: "backlog",
    description: "Documentar edge cases e regras do fluxo de devolução.",
    update: "Aguardando validação do negócio.",
  },
];

function setBanner(text, isRemote) {
  storageBanner.textContent = text;
  storageBanner.classList.toggle("is-remote", isRemote);
}

function normalizeDemand(raw) {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    update: raw.update || "",
    status: raw.status || "backlog",
  };
}

async function requestSupabase(path, options = {}) {
  const response = await fetch(`${supabaseBaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
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
  throw new Error(`Supabase ${response.status}: ${errorBody || "sem detalhes"}`);
}

function formatRemoteError(error) {
  const msg = String(error?.message || "");
  if (msg.includes("404")) {
    return "Erro remoto (404): verifique supabaseUrl, tableName e schema (ex.: schema: 'public').";
  }
  if (msg.includes("401") || msg.includes("403")) {
    return "Erro remoto (auth): confira anon key e políticas RLS da tabela.";
  }
  return "Falha no remoto. Verifique URL, chave e políticas RLS no Supabase.";
}

async function remoteFetchDemands() {
  const rows = await requestSupabase(
    `${tableTarget.table}?select=id,title,description,update,status,created_at&order=created_at.desc.nullslast`,
  );
  return rows.map(normalizeDemand);
}

async function remoteInsertDemand(demand) {
  const inserted = await requestSupabase(tableTarget.table, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([demand]),
  });

  return normalizeDemand(inserted[0]);
}

async function remoteUpdateDemand(demand) {
  await requestSupabase(`${tableTarget.table}?id=eq.${encodeURIComponent(demand.id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ update: demand.update, status: demand.status }),
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
  if (status === "andamento") return "Em andamento";
  if (status === "concluida") return "Concluída";
  return "Backlog";
}

function updateSummary() {
  totalCount.textContent = `${demands.length} demandas`;
  progressCount.textContent = `${demands.filter((item) => item.status === "andamento").length} demandas`;
  doneCount.textContent = `${demands.filter((item) => item.status === "concluida").length} demandas`;
}

function openDemandDetails(demand) {
  selectedDemandId = demand.id;
  detailsTitle.textContent = demand.title;
  detailsDescription.textContent = demand.description;
  detailsStatusInput.value = demand.status;
  detailsUpdateInput.value = demand.update || "";
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

    node.querySelector(".card-title").textContent = demand.title;
    node.querySelector(".card-description").textContent = demand.description;
    chip.textContent = translateStatus(demand.status);
    chip.classList.add(demand.status);

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

  const demand = {
    id: generateId(),
    title: document.getElementById("titleInput").value.trim(),
    description: document.getElementById("descriptionInput").value.trim(),
    status: document.getElementById("statusInput").value,
    update: "",
  };

  if (hasRemoteConfig) {
    try {
      const inserted = await remoteInsertDemand(demand);
      demands.unshift(inserted);
    } catch (error) {
      console.error(error);
      setBanner(`${formatRemoteError(error)} (fallback local ativado)`, false);
      return;
    }
  } else {
    demands.unshift(demand);
    persistLocalDemands();
  }

  updateSummary();
  renderBoard();
  demandForm.reset();
  demandDialog.close();
});

detailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const target = demands.find((item) => item.id === selectedDemandId);
  if (!target) return;

  target.status = detailsStatusInput.value;
  target.update = detailsUpdateInput.value.trim();

  if (hasRemoteConfig) {
    try {
      await remoteUpdateDemand(target);
    } catch (error) {
      console.error(error);
      setBanner(`${formatRemoteError(error)} (fallback local ativado)`, false);
      return;
    }
  } else {
    persistLocalDemands();
  }

  updateSummary();
  renderBoard();
  detailsDialog.close();
});

(async function init() {
  setBanner("Conectando e carregando demandas...", false);
  await bootstrapDemands();
  updateSummary();
  renderBoard();
})();
