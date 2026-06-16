require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "sisouve",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

async function main() {
  const [connection, tables, status, views] = await Promise.all([
    pool.query("SELECT current_database() AS banco, current_user AS usuario, now() AS consultado_em"),
    pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'sisouve'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `),
    pool.query("SELECT codigo, nome FROM sisouve.status_manifestacao ORDER BY ordem"),
    pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'sisouve'
      ORDER BY table_name;
    `),
  ]);

  console.log("Conexao OK:", connection.rows[0]);
  console.log("Tabelas:", tables.rows.map((row) => row.table_name).join(", "));
  console.log("Status cadastrados:", status.rowCount);
  console.log("Views:", views.rows.map((row) => row.table_name).join(", "));
}

main()
  .catch((error) => {
    console.error("Erro ao verificar banco:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
