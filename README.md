# API SisOuve

API em Node.js para conectar o SisOuve ao banco PostgreSQL.

## 1. Configurar ambiente

Copie `.env.example` para `.env` e preencha a senha do PostgreSQL:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sisouve
DB_ADMIN_DATABASE=postgres
DB_USER=postgres
DB_PASSWORD=sua_senha
JWT_SECRET=troque_por_uma_chave_grande_e_segura
```

## 2. Instalar dependencias

```bash
npm install
```

## 3. Criar e atualizar o banco

Este comando cria o banco `sisouve`, aplica o schema principal e tambem cria as views de visualizacao:

```bash
npm run db:init
```

Para conferir se a conexao, tabelas e views estao corretas:

```bash
npm run db:check
```

## 4. Criar usuario administrador

```bash
npm run criar-admin -- admin@sisouve.local senha123 "Administrador SisOuve"
```

## 5. Iniciar API

```bash
npm run dev
```

Teste no navegador:

```text
http://localhost:3000/saude
```

## Rotas principais

- `POST /login`
- `GET /me`
- `POST /usuarios`
- `GET /status-manifestacao`
- `GET /categorias`
- `POST /manifestacoes`
- `GET /manifestacoes`
- `GET /manifestacoes/:protocolo`
- `GET /manifestacoes/rastreio/:codigo`
- `PUT /manifestacoes/:id/triagem`
- `POST /manifestacoes/:id/anexos`
- `GET /orgaos`
- `POST /orgaos`
- `PUT /orgaos/:id`
- `POST /encaminhamentos`
- `POST /respostas-orgao`
- `POST /respostas-ogm`
- `GET /dashboard`
- `GET /admin/banco/resumo`

## Visualizar no PostgreSQL/pgAdmin

Depois de rodar `npm run db:init`, abra o pgAdmin e navegue em:

`Servers > PostgreSQL > Databases > sisouve > Schemas > sisouve`

As tabelas ficam em `Tables` e as consultas prontas ficam em `Views`.

Views mais uteis:

- `vw_manifestacoes_completa`: visao completa das manifestacoes, com status, categoria, orgao e dados do manifestante quando nao for anonima.
- `vw_manifestacoes_operacional`: listagem operacional usada pela API.
- `vw_historico_completo`: linha do tempo das alteracoes de cada manifestacao.
- `vw_dashboard_resumo_status`: totais por status.
- `vw_dashboard_por_orgao`: totais por orgao.
- `vw_resumo_tabelas`: contagem de registros por tabela.

Consultas prontas para o pgAdmin:

```sql
SELECT *
FROM sisouve.vw_manifestacoes_completa
ORDER BY registrada_em DESC;
```

```sql
SELECT *
FROM sisouve.vw_resumo_tabelas
ORDER BY tabela;
```

```sql
SELECT *
FROM sisouve.vw_historico_completo
ORDER BY criado_em DESC;
```

## Exemplo de criacao de manifestacao

```json
{
  "canal": "site",
  "tipo": "reclamacao",
  "grau_sigilo": "identificado",
  "nome": "Maria Silva",
  "email": "maria@email.com",
  "relato": "Iluminacao publica apagada na rua principal.",
  "local_ocorrencia": "Rua Principal, Centro"
}
```

Valores aceitos para `tipo`: `reclamacao`, `denuncia`, `sugestao`, `solicitacao`, `elogio`.

Valores aceitos para `grau_sigilo`: `identificado`, `sigiloso`, `anonimo`.
