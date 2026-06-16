# Banco de Dados Relacional do SisOuve

Este modelo foi criado para PostgreSQL e cobre os tres modulos principais do SisOuve:

- Interface do cidadao
- Painel administrativo da OGM
- Portal de resposta dos orgaos terceiros

## Onde o banco entra no sistema

O banco deve ficar atras da API/backend do SisOuve. As telas nao devem acessar o banco diretamente.

Fluxo recomendado:

1. O cidadao envia uma manifestacao pelo site ou app.
2. O backend valida os dados, gera o protocolo e grava em `manifestacoes`.
3. Se houver identificacao, grava os dados pessoais em `manifestantes`.
4. Os anexos ficam em armazenamento seguro de arquivos, e o banco guarda os metadados em `anexos_manifestacao`.
5. A triagem por IA grava sugestoes em `analises_ia`.
6. A OGM revisa classificacao, orgao e prioridade.
7. Cada mudanca importante gera registro em `historico_manifestacao`.
8. O encaminhamento ao orgao terceiro grava em `encaminhamentos`.
9. O orgao terceiro responde em `respostas_orgao`.
10. A OGM finaliza em `respostas_ogm`.
11. As telas de acompanhamento, dashboard e relatorios consultam as visoes `vw_manifestacoes_operacional`, `vw_dashboard_resumo_status` e `vw_dashboard_por_orgao`.

## Como criar o banco

Crie um banco vazio no PostgreSQL:

```sql
CREATE DATABASE sisouve;
```

Depois execute o script:

```bash
psql -U seu_usuario -d sisouve -f database/sisouve_schema_postgresql.sql
```

Para criar tambem as views de visualizacao usadas no pgAdmin:

```bash
psql -U seu_usuario -d sisouve -f database/sisouve_visualizacao_postgresql.sql
```

Se preferir fazer tudo pela API, entre na pasta `API-SisOuve`, configure o `.env` e rode:

```bash
npm run db:init
```

## Tabelas principais

`manifestacoes`

Guarda o chamado principal: protocolo, tipo, relato, local, status, prazo, sigilo, categoria, orgao sugerido e orgao definido.

`manifestantes`

Guarda dados pessoais do cidadao. Fica separado de `manifestacoes` para facilitar sigilo, anonimato e regras de LGPD.

`orgaos`

Cadastro de secretarias, setores ou orgaos terceiros que recebem demandas da OGM.

`usuarios`

Usuarios internos: administradores, ouvidores, gestores da OGM e tecnicos dos orgaos.

`historico_manifestacao`

Log de auditoria da manifestacao. Deve registrar classificacoes, mudancas de status, encaminhamentos, devolucoes, respostas e finalizacoes.

`encaminhamentos`

Controla cada envio da OGM para um orgao terceiro.

`respostas_orgao`

Resposta tecnica enviada pelo orgao terceiro para validacao da OGM.

`respostas_ogm`

Resposta final da Ouvidoria ao manifestante.

`notificacoes`

Controle de e-mails, SMS, WhatsApp ou avisos internos enviados pelo sistema.

## Regras importantes

- Manifestacoes anonimas nao devem ter `manifestante_id`.
- Manifestacoes sigilosas podem ter manifestante, mas o portal do orgao terceiro nao deve exibir os dados pessoais.
- O codigo de rastreio nao deve ser salvo puro. O script usa `codigo_rastreio_hash`.
- Anexos grandes nao devem ser salvos diretamente no banco. Salve o arquivo em storage seguro e guarde no banco apenas nome, tipo, tamanho e caminho.
- O historico nao deve ser apagado por usuarios comuns.
- Cada manifestacao deve ter apenas um encaminhamento ativo por vez.

## Consultas uteis

Listagem operacional:

```sql
SELECT *
FROM sisouve.vw_manifestacoes_operacional
ORDER BY registrada_em DESC;
```

Pendencias por status:

```sql
SELECT *
FROM sisouve.vw_dashboard_resumo_status;
```

Resumo por orgao:

```sql
SELECT *
FROM sisouve.vw_dashboard_por_orgao
ORDER BY total_manifestacoes DESC;
```

Manifestacoes vencidas:

```sql
SELECT *
FROM sisouve.vw_manifestacoes_operacional
WHERE situacao_prazo = 'vencida'
  AND finalizada_em IS NULL;
```

Visao completa para abrir no pgAdmin:

```sql
SELECT *
FROM sisouve.vw_manifestacoes_completa
ORDER BY registrada_em DESC;
```

Resumo de registros por tabela:

```sql
SELECT *
FROM sisouve.vw_resumo_tabelas
ORDER BY tabela;
```

Historico completo das manifestacoes:

```sql
SELECT *
FROM sisouve.vw_historico_completo
ORDER BY criado_em DESC;
```

## Proximo passo recomendado

Depois de criar o banco, o backend deve ter servicos para:

- Criar manifestacao
- Consultar por protocolo ou codigo de rastreio
- Listar e filtrar manifestacoes
- Salvar triagem da OGM
- Encaminhar ao orgao
- Registrar resposta do orgao
- Registrar resposta final da OGM
- Gerar dashboard e relatorios
- Registrar historico automaticamente em cada acao importante
