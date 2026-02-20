window.APP_CONFIG = {
  supabaseUrl: "https://itgexftkwxgdqcvcoedh.supabase.co",
 supabaseAnonKey: "sb_publishable_CgwdNRZQoZoAh0yicSmVHw_Ae5LXm9a",
  tableName: "base_pix",
  schema: "public",
};


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
    status: raw.status || "backlog",
  };
}

function buildAuthHeaders() {
  const key = String(config.supabaseAnonKey || "").trim();
  const headers = { apikey: key };

  // Chaves JWT antigas começam com eyJ.
  // Em chaves publishable (sb_publishable_...) evitamos enviar Bearer para não causar erro de JWT inválido.
  if (key.startsWith("eyJ")) {
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
  throw new Error(`Supabase ${response.status}: ${errorBody || "sem detalhes"}`);
}

function formatRemoteError(error) {
  const msg = String(error?.message || "");

  if (msg.includes("404")) {
    return "Erro remoto (404): verifique supabaseUrl, tableName e schema.";
  }

  if (
    msg.includes("Invalid API key") ||
    msg.includes("No API key found") ||
    msg.includes("401") ||
    msg.includes("JWT")
  ) {
    return "Erro auth: confirme se a chave é válida (anon JWT ou publishable) e se o projeto está ativo.";
  }

  if (msg.includes("403") || msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Erro de permissão: ajuste RLS/policies (SELECT/INSERT/UPDATE) para role anon.";
  }

  if (msg.includes("The schema must be one of") || msg.includes("schema")) {
    return "Schema não exposto: adicione o schema em Settings > API > Exposed schemas.";
  }

  return "Falha no remoto. Verifique URL, chave, schema exposto e políticas RLS.";
}

async function remoteFetchDemands() {
  const rows = await requestSupabase(
    `${tableTarget.table}?select=primari_key,id,demanda,produto,sistema,plataforma,status,atualizacao,data_criacao,data_atualiza&order=data_criacao.desc.nullslast,primari_key.desc`,
  );
  return rows.map(normalizeDemand);
}

async function remoteInsertDemand(demand) {
  const payload = {
    id: demand.id,
    demanda: demand.title,
    status: demand.status,
    atualizacao: demand.update || "",
    data_criacao: new Date().toISOString().slice(0, 10),
    data_atualiza: new Date().toISOString().slice(0, 10),
    squad_team: "pix",
  };

  const inserted = await requestSupabase(tableTarget.table, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([payload]),
  });

  return normalizeDemand(inserted[0]);
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
      status: demand.status,
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
