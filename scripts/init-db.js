require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const dbName = process.env.DB_NAME || "sisouve";
const dbUser = process.env.DB_USER || "postgres";
const dbPassword = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST || "localhost";
const dbPort = Number(process.env.DB_PORT || 5432);

const rootDir = path.resolve(__dirname, "..");
const schemaPath = path.join(rootDir, "database", "sisouve_schema_postgresql.sql");
const visualizationPath = path.join(rootDir, "database", "sisouve_visualizacao_postgresql.sql");

function baseConfig(database) {
  return {
    host: dbHost,
    port: dbPort,
    database,
    user: dbUser,
    password: dbPassword,
  };
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function databaseExists(pool) {
  const result = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  return result.rowCount > 0;
}

async function createDatabaseIfNeeded() {
  const adminPool = new Pool(baseConfig(process.env.DB_ADMIN_DATABASE || "postgres"));

  try {
    if (await databaseExists(adminPool)) {
      console.log(`Banco "${dbName}" ja existe.`);
      return;
    }

    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    console.log(`Banco "${dbName}" criado.`);
  } finally {
    await adminPool.end();
  }
}

async function runSqlFile(pool, filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo nao encontrado: ${filePath}`);
  }

  await pool.query(fs.readFileSync(filePath, "utf8"));
  console.log(`${label} aplicado com sucesso.`);
}

async function main() {
  await createDatabaseIfNeeded();

  const appPool = new Pool(baseConfig(dbName));

  try {
    await runSqlFile(appPool, schemaPath, "Schema principal");
    await runSqlFile(appPool, visualizationPath, "Views de visualizacao");
  } finally {
    await appPool.end();
  }
}

main().catch((error) => {
  console.error("Erro ao preparar banco:", error.message);
  process.exitCode = 1;
});
