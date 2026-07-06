require('dotenv').config();

const { initializeSchema, getPool } = require('../db/postgres');

async function main() {
  try {
    await initializeSchema();
    console.log('Emotional support schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize emotional support schema.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
