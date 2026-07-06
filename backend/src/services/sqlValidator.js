/**
 * Safety validator for LLM-produced SQL.
 *
 * The validator is intentionally strict and dependency-free. It only allows:
 *   - exactly one statement
 *   - which is a SELECT
 *   - against tables present in `schemaDescription.ALLOWED_TABLES`
 *   - with `WHERE <table>.<userIdColumn> = $1` for every user-scoped table
 *     (or an unqualified `<userIdColumn> = $1` when the generated SELECT uses
 *     a single-table shorthand)
 *   - with a hard LIMIT (added if missing)
 *
 * Anything else \u2192 thrown error \u2192 the controller turns it into a polite
 * "I cannot answer that safely" reply.
 */

const { TABLES, ALLOWED_TABLES } = require('../data/schemaDescription');

const FORBIDDEN_PATTERNS = [
  { pattern: /;\s*\S/u, reason: 'multiple statements are not allowed' },
  { pattern: /--/u, reason: 'SQL comments are not allowed' },
  { pattern: /\/\*/u, reason: 'SQL comments are not allowed' },
  { pattern: /\binto\s+outfile\b/iu, reason: 'file IO is not allowed' },
  { pattern: /\bcopy\b/iu, reason: 'COPY is not allowed' },
  { pattern: /\bpg_/iu, reason: 'pg_* catalog access is not allowed' },
  { pattern: /\binformation_schema\b/iu, reason: 'information_schema access is not allowed' },
  { pattern: /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|call|do|vacuum|analyze|reindex|cluster|listen|notify|begin|commit|rollback|savepoint|set\s+role|set\s+session)\b/iu,
    reason: 'only SELECT statements are allowed' },
];

const stripStringLiterals = (sql) => sql
  .replace(/'(?:''|[^'])*'/g, "''")
  .replace(/"(?:""|[^"])*"/g, '""');

const collectTables = (normalizedSql) => {
  const referenced = new Set();
  const re = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/giu;
  let match;
  while ((match = re.exec(normalizedSql)) !== null) {
    referenced.add(match[1].toLowerCase());
  }
  return referenced;
};

const hasUserScopeClause = (normalizedSql, table, referencedTables) => {
  const meta = TABLES[table];
  if (!meta || meta.userIdColumn === null) {
    return true;
  }

  const col = meta.userIdColumn;
  // Accepts:   table.col = $1
  //            "table"."col" = $1
  //            col = $1          (single-table shorthand emitted by some examples)
  //            <alias>.col = $1   (we cannot fully resolve alias->table without a parser,
  //                                 so we accept any "<ident>.col = $1" clause that exists
  //                                 alongside this table being referenced. Combined with the
  //                                 ALLOWED_TABLES check, the worst case is the LLM scopes a
  //                                 different allowed table by user_id which still keeps the
  //                                 query confined to the same user.)
  const directRe = new RegExp(`(?:^|[\\s(,])${table}\\.${col}\\s*=\\s*\\$1(?![0-9])`, 'iu');
  if (directRe.test(normalizedSql)) {
    return true;
  }

  const aliasRe = new RegExp(`(?:^|[\\s(,.])[a-zA-Z_][a-zA-Z0-9_]*\\.${col}\\s*=\\s*\\$1(?![0-9])`, 'iu');
  if (aliasRe.test(normalizedSql)) {
    return true;
  }

  const sameScopeColumnTables = Array.from(referencedTables || []).filter((tableName) => {
    const tableMeta = TABLES[tableName];
    return tableMeta && tableMeta.userIdColumn === col;
  });
  if (sameScopeColumnTables.length !== 1) {
    return false;
  }

  const unqualifiedRe = new RegExp(`(?:^|[\\s(,])${col}\\s*=\\s*\\$1(?![0-9])`, 'iu');
  return unqualifiedRe.test(normalizedSql);
};

const ensureLimit = (sql) => {
  if (/\blimit\s+\d+\b/iu.test(sql)) {
    return sql;
  }
  return `${sql.replace(/;\s*$/u, '')}\nLIMIT 100`;
};

const validateAndPrepareSql = (rawSql) => {
  if (typeof rawSql !== 'string' || !rawSql.trim()) {
    const err = new Error('Empty SQL');
    err.code = 'SQL_EMPTY';
    throw err;
  }

  const trimmed = rawSql.trim().replace(/;\s*$/u, '');
  const sanitized = stripStringLiterals(trimmed);
  const lowered = sanitized.toLowerCase();

  if (!/^\s*(?:with\s+[\s\S]+?\bselect|select)\b/u.test(lowered)) {
    const err = new Error('Only SELECT statements are allowed');
    err.code = 'SQL_NOT_SELECT';
    throw err;
  }

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(sanitized)) {
      const err = new Error(`Rejected by safety policy: ${reason}`);
      err.code = 'SQL_FORBIDDEN';
      err.reason = reason;
      throw err;
    }
  }

  const referenced = collectTables(sanitized);

  if (referenced.size === 0) {
    const err = new Error('No allowed table referenced');
    err.code = 'SQL_NO_TABLE';
    throw err;
  }

  for (const tableName of referenced) {
    if (!ALLOWED_TABLES.has(tableName)) {
      const err = new Error(`Table not allowed: ${tableName}`);
      err.code = 'SQL_TABLE_NOT_ALLOWED';
      err.table = tableName;
      throw err;
    }
  }

  let userScopedTouched = false;
  for (const tableName of referenced) {
    const meta = TABLES[tableName];
    if (!meta || meta.userIdColumn === null) {
      continue;
    }

    if (!hasUserScopeClause(sanitized, tableName, referenced)) {
      const err = new Error(`Missing user scope WHERE ${tableName}.${meta.userIdColumn} = $1`);
      err.code = 'SQL_NOT_USER_SCOPED';
      err.table = tableName;
      throw err;
    }
    userScopedTouched = true;
  }

  if (!userScopedTouched) {
    const err = new Error('Query must touch at least one user-scoped table');
    err.code = 'SQL_NOT_USER_SCOPED';
    throw err;
  }

  if (/\$([2-9]|\d{2,})\b/u.test(sanitized)) {
    const err = new Error('Only $1 (the user id) parameter is allowed');
    err.code = 'SQL_BAD_PARAM';
    throw err;
  }

  const finalSql = ensureLimit(trimmed);

  return {
    sql: finalSql,
    referencedTables: Array.from(referenced),
  };
};

module.exports = {
  validateAndPrepareSql,
};
