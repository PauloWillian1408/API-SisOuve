require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
const uploadDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadDir));

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "sisouve",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

const jwtSecret = process.env.JWT_SECRET || "sisouve_dev_secret";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const aleatorio = crypto.randomInt(100000, 999999);
  return `OUV-${ano}-${aleatorio}`;
}

function gerarCodigoRastreio() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function hashSenha(senha) {
  return crypto.createHash("sha256").update(String(senha)).digest("hex");
}

function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      orgao_id: usuario.orgao_id,
    },
    jwtSecret,
    { expiresIn: "8h" }
  );
}

function autenticar(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: "Token nao informado" });
  }

  try {
    req.usuario = jwt.verify(token, jwtSecret);
    next();
  } catch (error) {
    res.status(401).json({ erro: "Token invalido ou expirado" });
  }
}

function permitirPerfis(...perfis) {
  return (req, res, next) => {
    if (!perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({ erro: "Acesso nao autorizado" });
    }

    next();
  };
}

async function buscarStatus(client, codigo) {
  const resultado = await client.query(
    "SELECT id FROM sisouve.status_manifestacao WHERE codigo = $1",
    [codigo]
  );

  if (resultado.rowCount === 0) {
    throw new Error(`Status nao encontrado: ${codigo}`);
  }

  return resultado.rows[0].id;
}

async function registrarHistorico(client, dados) {
  await client.query(
    `
      INSERT INTO sisouve.historico_manifestacao (
        manifestacao_id,
        usuario_id,
        tipo_evento,
        status_anterior_id,
        status_novo_id,
        orgao_anterior_id,
        orgao_novo_id,
        descricao,
        metadados
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `,
    [
      dados.manifestacao_id,
      dados.usuario_id || null,
      dados.tipo_evento,
      dados.status_anterior_id || null,
      dados.status_novo_id || null,
      dados.orgao_anterior_id || null,
      dados.orgao_novo_id || null,
      dados.descricao,
      JSON.stringify(dados.metadados || {}),
    ]
  );
}

function aplicarFiltrosManifestacoes(query, params, filtros) {
  if (filtros.status) {
    params.push(filtros.status);
    query.push(`AND status_codigo = $${params.length}`);
  }

  if (filtros.tipo) {
    params.push(filtros.tipo);
    query.push(`AND tipo = $${params.length}`);
  }

  if (filtros.grau_sigilo) {
    params.push(filtros.grau_sigilo);
    query.push(`AND grau_sigilo = $${params.length}`);
  }

  if (filtros.orgao) {
    params.push(`%${filtros.orgao}%`);
    query.push(`AND orgao_responsavel ILIKE $${params.length}`);
  }

  if (filtros.situacao_prazo) {
    params.push(filtros.situacao_prazo);
    query.push(`AND situacao_prazo = $${params.length}`);
  }

  if (filtros.data_inicio) {
    params.push(filtros.data_inicio);
    query.push(`AND registrada_em >= $${params.length}`);
  }

  if (filtros.data_fim) {
    params.push(filtros.data_fim);
    query.push(`AND registrada_em < ($${params.length}::date + interval '1 day')`);
  }
}

app.get("/", (req, res) => {
  res.json({
    mensagem: "API do SisOuve rodando com sucesso",
    rotas: [
      "GET /saude",
      "POST /login",
      "POST /usuarios",
      "GET /me",
      "GET /status-manifestacao",
      "GET /categorias",
      "POST /manifestacoes",
      "GET /manifestacoes",
      "GET /manifestacoes/:protocolo",
      "GET /manifestacoes/rastreio/:codigo",
      "POST /manifestacoes/:id/anexos",
      "POST /orgaos",
      "GET /orgaos",
      "PUT /orgaos/:id",
      "POST /encaminhamentos",
      "POST /respostas-orgao",
      "POST /respostas-ogm",
      "GET /dashboard",
      "GET /admin/banco/resumo",
    ],
  });
});

app.get("/saude", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ api: "ok", banco: "ok" });
  } catch (error) {
    res.status(500).json({ api: "ok", banco: "erro", mensagem: error.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "Informe email e senha" });
  }

  try {
    const resultado = await pool.query(
      `
        SELECT id, orgao_id, nome, email, perfil, senha_hash, ativo
        FROM sisouve.usuarios
        WHERE email = $1;
      `,
      [email]
    );

    if (resultado.rowCount === 0 || !resultado.rows[0].ativo) {
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    const usuario = resultado.rows[0];

    if (usuario.senha_hash !== hashSenha(senha)) {
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    await pool.query("UPDATE sisouve.usuarios SET ultimo_acesso_em = now() WHERE id = $1", [
      usuario.id,
    ]);

    delete usuario.senha_hash;
    delete usuario.ativo;

    res.json({ token: gerarToken(usuario), usuario });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao fazer login" });
  }
});

app.get("/me", autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

app.post("/usuarios", autenticar, permitirPerfis("admin", "gestor_ogm"), async (req, res) => {
  const { nome, email, senha, perfil, orgao_id } = req.body;

  if (!nome || !email || !senha || !perfil) {
    return res.status(400).json({ erro: "Campos obrigatorios: nome, email, senha e perfil" });
  }

  try {
    const resultado = await pool.query(
      `
        INSERT INTO sisouve.usuarios (nome, email, senha_hash, perfil, orgao_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, nome, email, perfil, orgao_id, ativo, criado_em;
      `,
      [nome, email, hashSenha(senha), perfil, orgao_id || null]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao criar usuario", detalhe: error.message });
  }
});

app.get("/status-manifestacao", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT codigo, nome, descricao, finalizador, conta_pendencia, ordem
      FROM sisouve.status_manifestacao
      WHERE ativo = true
      ORDER BY ordem;
    `);

    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar status da manifestacao" });
  }
});

app.get("/categorias", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT id, nome, descricao
      FROM sisouve.categorias
      WHERE ativo = true
      ORDER BY nome;
    `);

    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar categorias" });
  }
});

app.post("/manifestacoes", async (req, res) => {
  const {
    canal = "site",
    tipo,
    grau_sigilo,
    nome,
    cpf_cnpj,
    email,
    contato_alternativo_tipo,
    contato_alternativo_valor,
    relato,
    local_ocorrencia,
    latitude,
    longitude,
  } = req.body;

  if (!tipo || !grau_sigilo || !relato || !local_ocorrencia) {
    return res.status(400).json({
      erro: "Campos obrigatorios: tipo, grau_sigilo, relato e local_ocorrencia",
    });
  }

  if (grau_sigilo !== "anonimo" && (!nome || !email)) {
    return res.status(400).json({
      erro: "Manifestacoes identificadas ou sigilosas precisam de nome e email",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const statusId = await buscarStatus(client, "aguardando_analise");
    const protocolo = gerarProtocolo();
    const codigoRastreio = gerarCodigoRastreio();
    let manifestanteId = null;

    if (grau_sigilo !== "anonimo") {
      const manifestante = await client.query(
        `
          INSERT INTO sisouve.manifestantes (
            nome,
            cpf_cnpj,
            email,
            contato_alternativo_tipo,
            contato_alternativo_valor
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id;
        `,
        [
          nome,
          cpf_cnpj || null,
          email,
          contato_alternativo_tipo || null,
          contato_alternativo_valor || null,
        ]
      );

      manifestanteId = manifestante.rows[0].id;
    }

    const manifestacao = await client.query(
      `
        INSERT INTO sisouve.manifestacoes (
          protocolo,
          codigo_rastreio_hash,
          manifestante_id,
          canal,
          tipo,
          grau_sigilo,
          relato,
          local_ocorrencia,
          latitude,
          longitude,
          status_id,
          prazo_resposta_final_em
        )
        VALUES (
          $1,
          crypt($2, gen_salt('bf')),
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          now() + interval '30 days'
        )
        RETURNING id, protocolo, registrada_em, prazo_resposta_final_em;
      `,
      [
        protocolo,
        codigoRastreio,
        manifestanteId,
        canal,
        tipo,
        grau_sigilo,
        relato,
        local_ocorrencia,
        latitude || null,
        longitude || null,
        statusId,
      ]
    );

    await registrarHistorico(client, {
      manifestacao_id: manifestacao.rows[0].id,
      tipo_evento: "criacao",
      status_novo_id: statusId,
      descricao: "Manifestacao registrada pelo cidadao.",
    });

    await client.query("COMMIT");

    res.status(201).json({
      mensagem: "Manifestacao registrada com sucesso",
      id: manifestacao.rows[0].id,
      protocolo: manifestacao.rows[0].protocolo,
      codigo_rastreio: codigoRastreio,
      registrada_em: manifestacao.rows[0].registrada_em,
      prazo_resposta_final_em: manifestacao.rows[0].prazo_resposta_final_em,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ erro: "Erro ao registrar manifestacao", detalhe: error.message });
  } finally {
    client.release();
  }
});

app.get("/manifestacoes", autenticar, async (req, res) => {
  try {
    const partes = [
      `
        SELECT *
        FROM sisouve.vw_manifestacoes_operacional
        WHERE 1 = 1
      `,
    ];
    const params = [];

    aplicarFiltrosManifestacoes(partes, params, req.query);

    if (req.usuario.perfil === "tecnico_orgao") {
      params.push(req.usuario.orgao_id);
      partes.push(`
        AND id IN (
          SELECT manifestacao_id
          FROM sisouve.encaminhamentos
          WHERE orgao_id = $${params.length}
        )
      `);
    }

    partes.push("ORDER BY registrada_em DESC LIMIT 200");

    const resultado = await pool.query(partes.join("\n"), params);
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao listar manifestacoes", detalhe: error.message });
  }
});

app.get("/manifestacoes/rastreio/:codigo", async (req, res) => {
  try {
    const resultado = await pool.query(
      `
        SELECT v.*
        FROM sisouve.vw_manifestacoes_operacional v
        JOIN sisouve.manifestacoes m ON m.id = v.id
        WHERE m.codigo_rastreio_hash = crypt($1, m.codigo_rastreio_hash);
      `,
      [req.params.codigo]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ erro: "Manifestacao nao encontrada" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao consultar codigo de rastreio" });
  }
});

app.get("/manifestacoes/:protocolo", async (req, res) => {
  try {
    const resultado = await pool.query(
      `
        SELECT *
        FROM sisouve.vw_manifestacoes_operacional
        WHERE protocolo = $1;
      `,
      [req.params.protocolo]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ erro: "Manifestacao nao encontrada" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao buscar manifestacao" });
  }
});

app.put(
  "/manifestacoes/:id/triagem",
  autenticar,
  permitirPerfis("admin", "ouvidor", "gestor_ogm"),
  async (req, res) => {
    const {
      tipo,
      categoria_id,
      subcategoria_id,
      orgao_definido_id,
      prioridade = "normal",
      observacoes_triagem,
      apta_para_envio = false,
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const atual = await client.query(
        "SELECT status_id, orgao_definido_id FROM sisouve.manifestacoes WHERE id = $1",
        [req.params.id]
      );

      if (atual.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ erro: "Manifestacao nao encontrada" });
      }

      const novoStatusId = apta_para_envio
        ? await buscarStatus(client, "pronta_envio")
        : atual.rows[0].status_id;

      const resultado = await client.query(
        `
          UPDATE sisouve.manifestacoes
          SET
            tipo = COALESCE($2, tipo),
            categoria_id = $3,
            subcategoria_id = $4,
            orgao_definido_id = $5,
            prioridade = $6,
            observacoes_triagem = $7,
            apta_para_envio = $8,
            status_id = $9
          WHERE id = $1
          RETURNING *;
        `,
        [
          req.params.id,
          tipo || null,
          categoria_id || null,
          subcategoria_id || null,
          orgao_definido_id || null,
          prioridade,
          observacoes_triagem || null,
          Boolean(apta_para_envio),
          novoStatusId,
        ]
      );

      await registrarHistorico(client, {
        manifestacao_id: req.params.id,
        usuario_id: req.usuario.id,
        tipo_evento: "classificacao",
        status_anterior_id: atual.rows[0].status_id,
        status_novo_id: novoStatusId,
        orgao_anterior_id: atual.rows[0].orgao_definido_id,
        orgao_novo_id: orgao_definido_id || null,
        descricao: "Triagem da manifestacao atualizada pela OGM.",
      });

      await client.query("COMMIT");
      res.json(resultado.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({ erro: "Erro ao atualizar triagem", detalhe: error.message });
    } finally {
      client.release();
    }
  }
);

app.post(
  "/manifestacoes/:id/anexos",
  autenticar,
  upload.array("arquivos", 10),
  async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const anexos = [];
      for (const file of req.files || []) {
        const resultado = await client.query(
          `
            INSERT INTO sisouve.anexos_manifestacao (
              manifestacao_id,
              enviado_por_usuario_id,
              nome_original,
              nome_armazenado,
              mime_type,
              tamanho_bytes,
              caminho_armazenamento,
              visivel_orgao
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
          `,
          [
            req.params.id,
            req.usuario.id,
            file.originalname,
            file.filename,
            file.mimetype,
            file.size,
            file.path,
            req.body.visivel_orgao !== "false",
          ]
        );
        anexos.push(resultado.rows[0]);
      }

      await registrarHistorico(client, {
        manifestacao_id: req.params.id,
        usuario_id: req.usuario.id,
        tipo_evento: "comentario_interno",
        descricao: `${anexos.length} anexo(s) adicionados a manifestacao.`,
      });

      await client.query("COMMIT");
      res.status(201).json(anexos);
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({ erro: "Erro ao salvar anexos", detalhe: error.message });
    } finally {
      client.release();
    }
  }
);

app.get("/orgaos", autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT id, nome, sigla, email, responsavel_nome, telefone, prazo_resposta_dias, ativo
      FROM sisouve.orgaos
      ORDER BY nome;
    `);

    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao listar orgaos" });
  }
});

app.post("/orgaos", autenticar, permitirPerfis("admin", "gestor_ogm"), async (req, res) => {
  const { nome, sigla, email, responsavel_nome, responsavel_cargo, telefone, prazo_resposta_dias } =
    req.body;

  if (!nome || !email) {
    return res.status(400).json({ erro: "Campos obrigatorios: nome e email" });
  }

  try {
    const resultado = await pool.query(
      `
        INSERT INTO sisouve.orgaos (
          nome,
          sigla,
          email,
          responsavel_nome,
          responsavel_cargo,
          telefone,
          prazo_resposta_dias
        )
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 30))
        RETURNING *;
      `,
      [
        nome,
        sigla || null,
        email,
        responsavel_nome || null,
        responsavel_cargo || null,
        telefone || null,
        prazo_resposta_dias || null,
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao criar orgao", detalhe: error.message });
  }
});

app.put("/orgaos/:id", autenticar, permitirPerfis("admin", "gestor_ogm"), async (req, res) => {
  const { nome, sigla, email, responsavel_nome, responsavel_cargo, telefone, prazo_resposta_dias, ativo } =
    req.body;

  try {
    const resultado = await pool.query(
      `
        UPDATE sisouve.orgaos
        SET
          nome = COALESCE($2, nome),
          sigla = COALESCE($3, sigla),
          email = COALESCE($4, email),
          responsavel_nome = COALESCE($5, responsavel_nome),
          responsavel_cargo = COALESCE($6, responsavel_cargo),
          telefone = COALESCE($7, telefone),
          prazo_resposta_dias = COALESCE($8, prazo_resposta_dias),
          ativo = COALESCE($9, ativo)
        WHERE id = $1
        RETURNING *;
      `,
      [
        req.params.id,
        nome || null,
        sigla || null,
        email || null,
        responsavel_nome || null,
        responsavel_cargo || null,
        telefone || null,
        prazo_resposta_dias || null,
        typeof ativo === "boolean" ? ativo : null,
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ erro: "Orgao nao encontrado" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao atualizar orgao", detalhe: error.message });
  }
});

app.post(
  "/encaminhamentos",
  autenticar,
  permitirPerfis("admin", "ouvidor", "gestor_ogm"),
  async (req, res) => {
    const { manifestacao_id, orgao_id, mensagem_encaminhamento, observacoes_ogm } = req.body;
    const client = await pool.connect();

    if (!manifestacao_id || !orgao_id || !mensagem_encaminhamento) {
      return res.status(400).json({
        erro: "Campos obrigatorios: manifestacao_id, orgao_id e mensagem_encaminhamento",
      });
    }

    try {
      await client.query("BEGIN");

      const manifestacao = await client.query(
        "SELECT status_id FROM sisouve.manifestacoes WHERE id = $1",
        [manifestacao_id]
      );

      if (manifestacao.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ erro: "Manifestacao nao encontrada" });
      }

      const orgao = await client.query(
        "SELECT prazo_resposta_dias FROM sisouve.orgaos WHERE id = $1 AND ativo = true",
        [orgao_id]
      );

      if (orgao.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ erro: "Orgao nao encontrado ou inativo" });
      }

      await client.query(
        "UPDATE sisouve.encaminhamentos SET ativo = false WHERE manifestacao_id = $1",
        [manifestacao_id]
      );

      const novoStatusId = await buscarStatus(client, "aguardando_resposta_orgao");
      const prazoDias = orgao.rows[0].prazo_resposta_dias || 30;

      const encaminhamento = await client.query(
        `
          INSERT INTO sisouve.encaminhamentos (
            manifestacao_id,
            orgao_id,
            enviado_por_usuario_id,
            mensagem_encaminhamento,
            observacoes_ogm,
            prazo_resposta_em,
            ativo
          )
          VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval, true)
          RETURNING *;
        `,
        [
          manifestacao_id,
          orgao_id,
          req.usuario.id,
          mensagem_encaminhamento,
          observacoes_ogm || null,
          prazoDias,
        ]
      );

      await client.query(
        `
          UPDATE sisouve.manifestacoes
          SET status_id = $2, orgao_definido_id = $3, apta_para_envio = true
          WHERE id = $1;
        `,
        [manifestacao_id, novoStatusId, orgao_id]
      );

      await registrarHistorico(client, {
        manifestacao_id,
        usuario_id: req.usuario.id,
        tipo_evento: "encaminhamento",
        status_anterior_id: manifestacao.rows[0].status_id,
        status_novo_id: novoStatusId,
        orgao_novo_id: orgao_id,
        descricao: "Manifestacao encaminhada ao orgao terceiro.",
      });

      await client.query("COMMIT");
      res.status(201).json(encaminhamento.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({ erro: "Erro ao encaminhar manifestacao", detalhe: error.message });
    } finally {
      client.release();
    }
  }
);

app.post("/respostas-orgao", autenticar, permitirPerfis("tecnico_orgao"), async (req, res) => {
  const { encaminhamento_id, texto_resposta } = req.body;
  const client = await pool.connect();

  if (!encaminhamento_id || !texto_resposta) {
    return res.status(400).json({ erro: "Campos obrigatorios: encaminhamento_id e texto_resposta" });
  }

  try {
    await client.query("BEGIN");

    const encaminhamento = await client.query(
      `
        SELECT id, manifestacao_id, orgao_id
        FROM sisouve.encaminhamentos
        WHERE id = $1 AND ativo = true;
      `,
      [encaminhamento_id]
    );

    if (encaminhamento.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ erro: "Encaminhamento ativo nao encontrado" });
    }

    if (String(encaminhamento.rows[0].orgao_id) !== String(req.usuario.orgao_id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ erro: "Este encaminhamento pertence a outro orgao" });
    }

    const resposta = await client.query(
      `
        INSERT INTO sisouve.respostas_orgao (
          encaminhamento_id,
          usuario_id,
          texto_resposta,
          enviada_para_validacao_em
        )
        VALUES ($1, $2, $3, now())
        RETURNING *;
      `,
      [encaminhamento_id, req.usuario.id, texto_resposta]
    );

    const statusAtual = await client.query(
      "SELECT status_id FROM sisouve.manifestacoes WHERE id = $1",
      [encaminhamento.rows[0].manifestacao_id]
    );
    const novoStatusId = await buscarStatus(client, "respondida_orgao");

    await client.query("UPDATE sisouve.manifestacoes SET status_id = $2 WHERE id = $1", [
      encaminhamento.rows[0].manifestacao_id,
      novoStatusId,
    ]);

    await registrarHistorico(client, {
      manifestacao_id: encaminhamento.rows[0].manifestacao_id,
      usuario_id: req.usuario.id,
      tipo_evento: "resposta_orgao",
      status_anterior_id: statusAtual.rows[0].status_id,
      status_novo_id: novoStatusId,
      descricao: "Orgao terceiro enviou resposta para validacao da OGM.",
    });

    await client.query("COMMIT");
    res.status(201).json(resposta.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ erro: "Erro ao registrar resposta do orgao", detalhe: error.message });
  } finally {
    client.release();
  }
});

app.post(
  "/respostas-ogm",
  autenticar,
  permitirPerfis("admin", "ouvidor", "gestor_ogm"),
  async (req, res) => {
    const { manifestacao_id, resposta_final, observacoes_internas, finalizar = true } = req.body;
    const client = await pool.connect();

    if (!manifestacao_id || !resposta_final) {
      return res.status(400).json({ erro: "Campos obrigatorios: manifestacao_id e resposta_final" });
    }

    try {
      await client.query("BEGIN");

      const statusAtual = await client.query(
        "SELECT status_id FROM sisouve.manifestacoes WHERE id = $1",
        [manifestacao_id]
      );

      if (statusAtual.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ erro: "Manifestacao nao encontrada" });
      }

      const resposta = await client.query(
        `
          INSERT INTO sisouve.respostas_ogm (
            manifestacao_id,
            usuario_id,
            resposta_final,
            observacoes_internas,
            enviada_ao_manifestante_em
          )
          VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() ELSE NULL END)
          RETURNING *;
        `,
        [
          manifestacao_id,
          req.usuario.id,
          resposta_final,
          observacoes_internas || null,
          Boolean(finalizar),
        ]
      );

      const novoStatusId = await buscarStatus(
        client,
        finalizar ? "concluida" : "resposta_ogm_registrada"
      );

      await client.query(
        `
          UPDATE sisouve.manifestacoes
          SET status_id = $2, finalizada_em = CASE WHEN $3 THEN now() ELSE finalizada_em END
          WHERE id = $1;
        `,
        [manifestacao_id, novoStatusId, Boolean(finalizar)]
      );

      await registrarHistorico(client, {
        manifestacao_id,
        usuario_id: req.usuario.id,
        tipo_evento: finalizar ? "finalizacao" : "resposta_ogm",
        status_anterior_id: statusAtual.rows[0].status_id,
        status_novo_id: novoStatusId,
        descricao: finalizar
          ? "Manifestacao finalizada pela OGM."
          : "Resposta final da OGM registrada.",
      });

      await client.query("COMMIT");
      res.status(201).json(resposta.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(500).json({ erro: "Erro ao registrar resposta da OGM", detalhe: error.message });
    } finally {
      client.release();
    }
  }
);

app.get("/dashboard", autenticar, async (req, res) => {
  try {
    const [status, orgaos, prazo] = await Promise.all([
      pool.query("SELECT * FROM sisouve.vw_dashboard_resumo_status"),
      pool.query("SELECT * FROM sisouve.vw_dashboard_por_orgao ORDER BY total_manifestacoes DESC"),
      pool.query(`
        SELECT situacao_prazo, count(*)::int AS total
        FROM sisouve.vw_manifestacoes_operacional
        GROUP BY situacao_prazo
        ORDER BY situacao_prazo;
      `),
    ]);

    res.json({
      por_status: status.rows,
      por_orgao: orgaos.rows,
      por_prazo: prazo.rows,
    });
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar dashboard" });
  }
});

app.get(
  "/admin/banco/resumo",
  autenticar,
  permitirPerfis("admin", "gestor_ogm"),
  async (req, res) => {
    try {
      const [conexao, tabelas, views, contadores] = await Promise.all([
        pool.query(`
          SELECT current_database() AS banco, current_user AS usuario, now() AS consultado_em;
        `),
        pool.query(`
          SELECT table_name AS nome
          FROM information_schema.tables
          WHERE table_schema = 'sisouve'
            AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `),
        pool.query(`
          SELECT table_name AS nome
          FROM information_schema.views
          WHERE table_schema = 'sisouve'
          ORDER BY table_name;
        `),
        pool.query("SELECT * FROM sisouve.vw_resumo_tabelas ORDER BY tabela;"),
      ]);

      res.json({
        conexao: conexao.rows[0],
        tabelas: tabelas.rows,
        views: views.rows,
        contadores: contadores.rows,
      });
    } catch (error) {
      res.status(500).json({
        erro: "Erro ao carregar resumo do banco",
        detalhe: error.message,
      });
    }
  }
);

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`API do SisOuve rodando com sucesso na porta ${port}`);
});
