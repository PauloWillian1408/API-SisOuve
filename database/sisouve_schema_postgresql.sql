-- Banco de dados relacional do projeto SisOuve
-- Recomendado: PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS sisouve;
SET search_path TO sisouve;

-- ============================================================
-- Tipos enumerados
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'canal_entrada') THEN
        CREATE TYPE canal_entrada AS ENUM ('site', 'app', 'interno', 'importacao');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_manifestacao') THEN
        CREATE TYPE tipo_manifestacao AS ENUM ('reclamacao', 'denuncia', 'sugestao', 'solicitacao', 'elogio');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grau_sigilo') THEN
        CREATE TYPE grau_sigilo AS ENUM ('identificado', 'sigiloso', 'anonimo');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridade_manifestacao') THEN
        CREATE TYPE prioridade_manifestacao AS ENUM ('baixa', 'normal', 'alta', 'urgente');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'perfil_usuario') THEN
        CREATE TYPE perfil_usuario AS ENUM ('admin', 'ouvidor', 'gestor_ogm', 'tecnico_orgao');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_contato') THEN
        CREATE TYPE tipo_contato AS ENUM ('telefone', 'whatsapp', 'sms', 'outro');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_evento_historico') THEN
        CREATE TYPE tipo_evento_historico AS ENUM (
            'criacao',
            'arquivamento',
            'triagem_ia',
            'classificacao',
            'alteracao_status',
            'alteracao_orgao',
            'apta_envio',
            'encaminhamento',
            'resposta_orgao',
            'devolucao_orgao',
            'resposta_ogm',
            'notificacao',
            'finalizacao',
            'reabertura',
            'comentario_interno'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_notificacao') THEN
        CREATE TYPE tipo_notificacao AS ENUM ('email', 'sms', 'whatsapp', 'sistema');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_notificacao') THEN
        CREATE TYPE status_notificacao AS ENUM ('pendente', 'enviada', 'falhou');
    END IF;
END $$;

-- ============================================================
-- Cadastros de apoio
-- ============================================================

CREATE TABLE IF NOT EXISTS status_manifestacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(60) NOT NULL UNIQUE,
    nome VARCHAR(120) NOT NULL,
    descricao TEXT,
    finalizador BOOLEAN NOT NULL DEFAULT FALSE,
    conta_pendencia BOOLEAN NOT NULL DEFAULT TRUE,
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS subcategorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID NOT NULL REFERENCES categorias(id),
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (categoria_id, nome)
);

CREATE TABLE IF NOT EXISTS orgaos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(180) NOT NULL,
    sigla VARCHAR(30),
    email VARCHAR(180) NOT NULL,
    responsavel_nome VARCHAR(180),
    responsavel_cargo VARCHAR(120),
    telefone VARCHAR(40),
    prazo_resposta_dias INTEGER NOT NULL DEFAULT 30 CHECK (prazo_resposta_dias > 0),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nome),
    UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orgao_id UUID REFERENCES orgaos(id),
    nome VARCHAR(180) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil perfil_usuario NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acesso_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tokens_acesso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    finalidade VARCHAR(40) NOT NULL CHECK (finalidade IN ('ativacao', 'recuperacao_senha')),
    expira_em TIMESTAMPTZ NOT NULL,
    usado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (token_hash)
);

-- ============================================================
-- Manifestante e manifestação
-- ============================================================

CREATE TABLE IF NOT EXISTS manifestantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(180),
    cpf_cnpj VARCHAR(20),
    email VARCHAR(180),
    contato_alternativo_tipo tipo_contato,
    contato_alternativo_valor VARCHAR(120),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT manifestante_contato_minimo_chk CHECK (
        nome IS NOT NULL
        OR cpf_cnpj IS NOT NULL
        OR email IS NOT NULL
        OR contato_alternativo_valor IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS manifestacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo VARCHAR(40) NOT NULL UNIQUE,
    codigo_rastreio_hash TEXT NOT NULL UNIQUE,
    manifestante_id UUID REFERENCES manifestantes(id),
    canal canal_entrada NOT NULL DEFAULT 'site',
    tipo tipo_manifestacao NOT NULL,
    grau_sigilo grau_sigilo NOT NULL,
    titulo VARCHAR(180),
    relato TEXT NOT NULL CHECK (char_length(relato) <= 5000),
    local_ocorrencia TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    status_id UUID NOT NULL REFERENCES status_manifestacao(id),
    categoria_id UUID REFERENCES categorias(id),
    subcategoria_id UUID REFERENCES subcategorias(id),
    orgao_sugerido_id UUID REFERENCES orgaos(id),
    orgao_definido_id UUID REFERENCES orgaos(id),
    prioridade prioridade_manifestacao NOT NULL DEFAULT 'normal',
    observacoes_triagem TEXT,
    apta_para_envio BOOLEAN NOT NULL DEFAULT FALSE,
    arquivada_por_incompletude BOOLEAN NOT NULL DEFAULT FALSE,
    prazo_resposta_final_em TIMESTAMPTZ NOT NULL,
    registrada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultima_atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizada_em TIMESTAMPTZ,
    CONSTRAINT anonimo_sem_manifestante_chk CHECK (
        (grau_sigilo = 'anonimo' AND manifestante_id IS NULL)
        OR (grau_sigilo <> 'anonimo')
    )
);

CREATE TABLE IF NOT EXISTS anexos_manifestacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifestacao_id UUID NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
    enviado_por_usuario_id UUID REFERENCES usuarios(id),
    nome_original VARCHAR(255) NOT NULL,
    nome_armazenado VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    tamanho_bytes BIGINT NOT NULL CHECK (tamanho_bytes > 0),
    caminho_armazenamento TEXT NOT NULL,
    visivel_orgao BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- IA, triagem, encaminhamento e respostas
-- ============================================================

CREATE TABLE IF NOT EXISTS analises_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifestacao_id UUID NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
    titulo_sugerido VARCHAR(180),
    resumo TEXT,
    categoria_sugerida_id UUID REFERENCES categorias(id),
    subcategoria_sugerida_id UUID REFERENCES subcategorias(id),
    orgao_sugerido_id UUID REFERENCES orgaos(id),
    confianca NUMERIC(5, 4) CHECK (confianca >= 0 AND confianca <= 1),
    modelo_usado VARCHAR(120),
    processada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS encaminhamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifestacao_id UUID NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
    orgao_id UUID NOT NULL REFERENCES orgaos(id),
    enviado_por_usuario_id UUID NOT NULL REFERENCES usuarios(id),
    mensagem_encaminhamento TEXT NOT NULL,
    observacoes_ogm TEXT,
    prazo_resposta_em TIMESTAMPTZ NOT NULL,
    enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_encaminhamento_ativo_manifestacao
    ON encaminhamentos (manifestacao_id)
    WHERE ativo = TRUE;

CREATE TABLE IF NOT EXISTS respostas_orgao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encaminhamento_id UUID NOT NULL REFERENCES encaminhamentos(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    texto_resposta TEXT NOT NULL,
    enviada_para_validacao_em TIMESTAMPTZ,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anexos_resposta_orgao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resposta_orgao_id UUID NOT NULL REFERENCES respostas_orgao(id) ON DELETE CASCADE,
    nome_original VARCHAR(255) NOT NULL,
    nome_armazenado VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    tamanho_bytes BIGINT NOT NULL CHECK (tamanho_bytes > 0),
    caminho_armazenamento TEXT NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS respostas_ogm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifestacao_id UUID NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    resposta_final TEXT NOT NULL,
    observacoes_internas TEXT,
    enviada_ao_manifestante_em TIMESTAMPTZ,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Histórico, notificações e auditoria
-- ============================================================

CREATE TABLE IF NOT EXISTS historico_manifestacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifestacao_id UUID NOT NULL REFERENCES manifestacoes(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id),
    tipo_evento tipo_evento_historico NOT NULL,
    status_anterior_id UUID REFERENCES status_manifestacao(id),
    status_novo_id UUID REFERENCES status_manifestacao(id),
    orgao_anterior_id UUID REFERENCES orgaos(id),
    orgao_novo_id UUID REFERENCES orgaos(id),
    descricao TEXT NOT NULL,
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifestacao_id UUID REFERENCES manifestacoes(id) ON DELETE SET NULL,
    orgao_id UUID REFERENCES orgaos(id) ON DELETE SET NULL,
    destinatario VARCHAR(180) NOT NULL,
    tipo tipo_notificacao NOT NULL,
    assunto VARCHAR(180),
    mensagem TEXT NOT NULL,
    status status_notificacao NOT NULL DEFAULT 'pendente',
    erro TEXT,
    enviada_em TIMESTAMPTZ,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    entidade VARCHAR(80) NOT NULL,
    entidade_id UUID,
    acao VARCHAR(60) NOT NULL,
    antes JSONB,
    depois JSONB,
    ip_origem VARCHAR(60),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indices para telas, filtros e relatorios
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_manifestacoes_registrada_em ON manifestacoes (registrada_em DESC);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_status ON manifestacoes (status_id);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_tipo ON manifestacoes (tipo);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_grau_sigilo ON manifestacoes (grau_sigilo);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_orgao_definido ON manifestacoes (orgao_definido_id);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_categoria ON manifestacoes (categoria_id);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_prazo ON manifestacoes (prazo_resposta_final_em);
CREATE INDEX IF NOT EXISTS idx_manifestacoes_abertas ON manifestacoes (prazo_resposta_final_em, status_id)
    WHERE finalizada_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_manifestacao_data ON historico_manifestacao (manifestacao_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_orgao ON encaminhamentos (orgao_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_status ON notificacoes (status, criada_em);

CREATE INDEX IF NOT EXISTS idx_manifestacoes_busca_relato
    ON manifestacoes USING gin (to_tsvector('portuguese', relato));

-- ============================================================
-- Triggers utilitarios
-- ============================================================

CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION atualizar_manifestacao_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.ultima_atualizacao_em = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orgaos_atualizado_em ON orgaos;
CREATE TRIGGER trg_orgaos_atualizado_em
BEFORE UPDATE ON orgaos
FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_usuarios_atualizado_em ON usuarios;
CREATE TRIGGER trg_usuarios_atualizado_em
BEFORE UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_manifestantes_atualizado_em ON manifestantes;
CREATE TRIGGER trg_manifestantes_atualizado_em
BEFORE UPDATE ON manifestantes
FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_manifestacoes_atualizado_em ON manifestacoes;
CREATE TRIGGER trg_manifestacoes_atualizado_em
BEFORE UPDATE ON manifestacoes
FOR EACH ROW EXECUTE FUNCTION atualizar_manifestacao_timestamp();

-- ============================================================
-- Visões para consulta operacional e dashboard
-- ============================================================

CREATE OR REPLACE VIEW vw_manifestacoes_operacional AS
SELECT
    m.id,
    m.protocolo,
    m.registrada_em,
    m.tipo,
    c.nome AS categoria,
    sc.nome AS subcategoria,
    s.codigo AS status_codigo,
    s.nome AS status_nome,
    o.nome AS orgao_responsavel,
    m.grau_sigilo,
    m.prazo_resposta_final_em,
    CASE
        WHEN m.finalizada_em IS NOT NULL THEN 'finalizada'
        WHEN m.prazo_resposta_final_em < now() THEN 'vencida'
        WHEN m.prazo_resposta_final_em <= now() + interval '5 days' THEN 'proxima_vencimento'
        ELSE 'dentro_prazo'
    END AS situacao_prazo,
    m.ultima_atualizacao_em,
    m.finalizada_em
FROM manifestacoes m
JOIN status_manifestacao s ON s.id = m.status_id
LEFT JOIN categorias c ON c.id = m.categoria_id
LEFT JOIN subcategorias sc ON sc.id = m.subcategoria_id
LEFT JOIN orgaos o ON o.id = m.orgao_definido_id;

CREATE OR REPLACE VIEW vw_dashboard_resumo_status AS
SELECT
    s.codigo,
    s.nome,
    count(m.id) AS total
FROM status_manifestacao s
LEFT JOIN manifestacoes m ON m.status_id = s.id
GROUP BY s.codigo, s.nome, s.ordem
ORDER BY s.ordem;

CREATE OR REPLACE VIEW vw_dashboard_por_orgao AS
SELECT
    o.id AS orgao_id,
    o.nome AS orgao,
    count(m.id) AS total_manifestacoes,
    count(m.id) FILTER (WHERE m.finalizada_em IS NULL) AS pendentes,
    count(m.id) FILTER (WHERE m.finalizada_em IS NOT NULL) AS finalizadas,
    count(m.id) FILTER (WHERE m.finalizada_em IS NULL AND m.prazo_resposta_final_em < now()) AS vencidas,
    avg(EXTRACT(EPOCH FROM (m.finalizada_em - m.registrada_em)) / 86400)
        FILTER (WHERE m.finalizada_em IS NOT NULL) AS tempo_medio_finalizacao_dias
FROM orgaos o
LEFT JOIN manifestacoes m ON m.orgao_definido_id = o.id
GROUP BY o.id, o.nome;

-- ============================================================
-- Dados iniciais
-- ============================================================

INSERT INTO status_manifestacao (codigo, nome, descricao, finalizador, conta_pendencia, ordem)
VALUES
    ('aguardando_analise', 'Aguardando analise', 'Manifestacao recebida e aguardando validacao da OGM.', FALSE, TRUE, 10),
    ('em_triagem', 'Em triagem', 'Manifestacao em classificacao pela OGM.', FALSE, TRUE, 20),
    ('arquivada_incompleta', 'Arquivada por incompletude', 'Manifestacao arquivada por falta de dados minimos.', TRUE, FALSE, 30),
    ('pronta_envio', 'Pronta para envio', 'Manifestacao validada e apta para encaminhamento.', FALSE, TRUE, 40),
    ('encaminhada_orgao', 'Encaminhada ao orgao', 'Manifestacao enviada ao orgao terceiro.', FALSE, TRUE, 50),
    ('aguardando_resposta_orgao', 'Aguardando resposta do orgao', 'Manifestacao em analise pelo orgao terceiro.', FALSE, TRUE, 60),
    ('respondida_orgao', 'Respondida pelo orgao', 'Resposta tecnica recebida e aguardando validacao da OGM.', FALSE, TRUE, 70),
    ('aguardando_nova_resposta', 'Aguardando nova resposta', 'Manifestacao devolvida ao orgao para complemento.', FALSE, TRUE, 80),
    ('em_prorrogacao', 'Em prorrogacao', 'Prazo prorrogado conforme regra da OGM.', FALSE, TRUE, 90),
    ('resposta_ogm_registrada', 'Resposta da OGM registrada', 'Resposta final escrita pela Ouvidoria.', FALSE, TRUE, 100),
    ('respondida_manifestante', 'Respondida ao manifestante', 'Resposta disponibilizada ao manifestante.', FALSE, FALSE, 110),
    ('concluida', 'Respondida e finalizada', 'Manifestacao encerrada.', TRUE, FALSE, 120)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO categorias (nome, descricao)
VALUES
    ('Saude', 'Demandas relacionadas a unidades, atendimento e servicos de saude.'),
    ('Educacao', 'Demandas relacionadas a escolas, transporte escolar e rede de ensino.'),
    ('Infraestrutura', 'Demandas sobre vias, iluminacao, limpeza urbana e obras.'),
    ('Assistencia social', 'Demandas relacionadas a programas e atendimento social.'),
    ('Atendimento ao cidadao', 'Demandas sobre qualidade de atendimento e servicos administrativos.')
ON CONFLICT (nome) DO NOTHING;

-- ============================================================
-- Exemplo de consulta pelo codigo de rastreio
-- A aplicacao deve comparar hash, nunca guardar o codigo puro.
-- ============================================================

-- SELECT *
-- FROM vw_manifestacoes_operacional
-- WHERE id = (
--     SELECT id
--     FROM manifestacoes
--     WHERE codigo_rastreio_hash = crypt(:codigo_informado, codigo_rastreio_hash)
-- );
