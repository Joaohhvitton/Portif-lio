# Redeflex Board (Squad PIX)

Projeto simples (HTML/CSS/JS) com visual moderno em vermelho escuro para gerenciar demandas da **Squad PIX**, inspirado no Jira.

## Funcionalidades

- Cadastro de demanda com título, descrição e status.
- Layout em cards com status visível (Backlog, Em andamento, Concluída).
- Ao clicar no card, abre o detalhe da demanda com campo para escrever/editar atualização do P.O.
- Contadores por status no topo.
- Persistência local (`localStorage`) por padrão.
- Persistência remota opcional com **Supabase** (compartilha dados entre máquinas).

## Rodando localmente

```bash
python3 -m http.server 4173
```

Depois acesse: `http://localhost:4173`

## Como salvar as atualizações do P.O. fora da sua máquina (Supabase)

1. Crie um projeto no Supabase.
2. Crie a tabela `demands`:

```sql
create table if not exists public.demands (
  id text primary key,
  title text not null,
  description text not null,
  status text not null default 'backlog',
  update text,
  created_at timestamptz default now()
);
```

3. Habilite RLS e adicione políticas de leitura/escrita para seu caso de uso.
4. Abra `config.js` e preencha:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "SEU_ANON_KEY",
  tableName: "demands",
  schema: "public",
};
```

Quando `supabaseUrl` e `supabaseAnonKey` estiverem preenchidos, o sistema entra em **modo remoto** e os updates do P.O. ficam salvos no Supabase.


### Observação importante de configuração

- Em `supabaseUrl`, use apenas a **origem do projeto**: `https://SEU-PROJETO.supabase.co`
- **Não** use caminho de tabela na URL (ex.: `...supabase.co/base_pix`)
- O nome da tabela vai em `tableName` (ex.: `demands` ou `public.demands`)
- Se a tabela estiver fora de `public`, preencha `schema` (ex.: `schema: "base_pix"`)


## Troubleshooting rápido (quando não aparece demanda remota)

Se aparecer banner de erro auth/permissão:

1. **API Key correta**
   - Use a **anon public key** completa em `supabaseAnonKey` (Project Settings → API).
   - Não use chave truncada.

2. **RLS + policies para anon**
   - Sua tabela precisa liberar `SELECT`, `INSERT` e `UPDATE` para role `anon`.

3. **Schema exposto na API**
   - Em Settings → API → **Exposed schemas**, inclua o schema configurado (`public` ou outro).

4. **URL e tabela**
   - `supabaseUrl`: `https://<project-ref>.supabase.co`
   - `tableName`: nome da tabela (ex.: `base_pix`)
   - `schema`: ex.: `public`
