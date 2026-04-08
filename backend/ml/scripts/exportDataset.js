const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const sqlPath = path.resolve(__dirname, '..', 'sql', 'medicine_safety_dataset.sql');
const outputDir = path.resolve(__dirname, '..', 'data');
const jsonOutputPath = path.join(outputDir, 'medicine_safety_dataset.json');
const csvOutputPath = path.join(outputDir, 'medicine_safety_dataset.csv');

const toCsvValue = (value) => {
  if (value == null) {
    return '';
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const rowsToCsv = (rows) => {
  if (!rows.length) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(',');
  const body = rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(','));
  return [headerLine, ...body].join('\n');
};

const buildDbConfig = () => {
  const hasExplicitFields = Boolean(
    process.env.DB_HOST ||
    process.env.DB_PORT ||
    process.env.DB_NAME ||
    process.env.DB_USER ||
    process.env.DB_PASSWORD
  );

  if (!hasExplicitFields && process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: ['localhost', '127.0.0.1'].includes(process.env.DB_HOST || 'localhost')
      ? false
      : { rejectUnauthorized: false },
  };
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const pool = new Pool(buildDbConfig());

  try {
    const result = await pool.query(sql);
    fs.writeFileSync(jsonOutputPath, JSON.stringify(result.rows, null, 2));
    fs.writeFileSync(csvOutputPath, rowsToCsv(result.rows));

    console.log(`[ML] Exported ${result.rows.length} rows`);
    console.log(`[ML] JSON -> ${jsonOutputPath}`);
    console.log(`[ML] CSV  -> ${csvOutputPath}`);
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error('[ML] Dataset export failed:', error.message);
  process.exit(1);
});
