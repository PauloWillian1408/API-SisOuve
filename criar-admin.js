require("dotenv").config();

const crypto = require("crypto");
const { Pool } = require("pg");

const [, , email, senha, nome = "Administrador SisOuve"] = process.argv;

if (!email || !senha) {
  console.log("Uso: node criar-admin.js admin@email.com senha123 \"Nome do Admin\"");
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "sisouve",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

function hashSenha(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex");
}

async function executar() {
  try {
    const resultado = await pool.query(
      `
        INSERT INTO sisouve.usuarios (nome, email, senha_hash, perfil, ativo)
        VALUES ($1, $2, $3, 'admin', true)
        ON CONFLICT (email)
        DO UPDATE SET
          nome = EXCLUDED.nome,
          senha_hash = EXCLUDED.senha_hash,
          perfil = 'admin',
          ativo = true
        RETURNING id, nome, email, perfil;
      `,
      [nome, email, hashSenha(senha)]
    );

    console.log("Administrador pronto:");
    console.log(resultado.rows[0]);
  } catch (error) {
    console.error("Erro ao criar administrador:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

executar();
