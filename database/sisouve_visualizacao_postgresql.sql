-- Views complementares para visualizar o SisOuve dentro do PostgreSQL/pgAdmin.
-- Execute depois de sisouve_schema_postgresql.sql.

CREATE SCHEMA IF NOT EXISTS sisouve;
SET search_path TO sisouve;

CREATE OR REPLACE VIEW vw_manifestacoes_completa AS
SELECT
    m.id,
    m.protocolo,
    m.registrada_em,
    m.ultima_atualizacao_em,
    m.finalizada_em,
    m.canal,
    m.tipo,
    m.grau_sigilo,
    m.prioridade,
    s.codigo AS status_codigo,
    s.nome AS status_nome,
    c.nome AS categoria,
    sc.nome AS subcategoria,
    os.nome AS orgao_sugerido,
    od.nome AS orgao_definido,
    CASE
        WHEN m.grau_sigilo = 'anonimo' THEN NULL
        ELSE mf.nome
    END AS manifestante_nome,
    CASE
        WHEN m.grau_sigilo = 'anonimo' THEN NULL
        ELSE mf.email
    END AS manifestante_email,
    m.local_ocorrencia,
    m.relato,
    m.observacoes_triagem,
    m.apta_para_envio,
    m.arquivada_por_incompletude,
    m.prazo_resposta_final_em,
    CASE
        WHEN m.finalizada_em IS NOT NULL THEN 'finalizada'
        WHEN m.prazo_resposta_final_em < now() THEN 'vencida'
        WHEN m.prazo_resposta_final_em <= now() + interval '5 days' THEN 'proxima_vencimento'
        ELSE 'dentro_prazo'
    END AS situacao_prazo
FROM manifestacoes m
JOIN status_manifestacao s ON s.id = m.status_id
LEFT JOIN manifestantes mf ON mf.id = m.manifestante_id
LEFT JOIN categorias c ON c.id = m.categoria_id
LEFT JOIN subcategorias sc ON sc.id = m.subcategoria_id
LEFT JOIN orgaos os ON os.id = m.orgao_sugerido_id
LEFT JOIN orgaos od ON od.id = m.orgao_definido_id;

CREATE OR REPLACE VIEW vw_historico_completo AS
SELECT
    h.id,
    h.criado_em,
    m.protocolo,
    h.tipo_evento,
    sa.codigo AS status_anterior,
    sn.codigo AS status_novo,
    oa.nome AS orgao_anterior,
    onovo.nome AS orgao_novo,
    u.nome AS usuario,
    u.perfil AS perfil_usuario,
    h.descricao,
    h.metadados
FROM historico_manifestacao h
JOIN manifestacoes m ON m.id = h.manifestacao_id
LEFT JOIN usuarios u ON u.id = h.usuario_id
LEFT JOIN status_manifestacao sa ON sa.id = h.status_anterior_id
LEFT JOIN status_manifestacao sn ON sn.id = h.status_novo_id
LEFT JOIN orgaos oa ON oa.id = h.orgao_anterior_id
LEFT JOIN orgaos onovo ON onovo.id = h.orgao_novo_id;

CREATE OR REPLACE VIEW vw_resumo_tabelas AS
SELECT 'manifestacoes' AS tabela, count(*)::int AS total FROM manifestacoes
UNION ALL SELECT 'manifestantes', count(*)::int FROM manifestantes
UNION ALL SELECT 'usuarios', count(*)::int FROM usuarios
UNION ALL SELECT 'orgaos', count(*)::int FROM orgaos
UNION ALL SELECT 'encaminhamentos', count(*)::int FROM encaminhamentos
UNION ALL SELECT 'respostas_orgao', count(*)::int FROM respostas_orgao
UNION ALL SELECT 'respostas_ogm', count(*)::int FROM respostas_ogm
UNION ALL SELECT 'historico_manifestacao', count(*)::int FROM historico_manifestacao
UNION ALL SELECT 'anexos_manifestacao', count(*)::int FROM anexos_manifestacao
UNION ALL SELECT 'notificacoes', count(*)::int FROM notificacoes;
