import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export function parsePostgresConnection(rawUrl) {
  if (!rawUrl) throw new Error('A PostgreSQL connection URL is required.');
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Connection URL must use postgres:// or postgresql://.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database)
    throw new Error('Connection URL must include a database name.');
  return {
    database,
    env: {
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    },
  };
}

export function assertRestoreConfirmation(database, options, nodeEnv) {
  if (options.confirm !== database) {
    throw new Error(`Restore requires --confirm=${database}.`);
  }
  if (nodeEnv === 'production' && !options.allowProduction) {
    throw new Error('Production restore requires --allow-production.');
  }
}

export function buildBackupArgs(database, output) {
  return [
    '--format=custom',
    '--compress=9',
    '--no-owner',
    '--no-privileges',
    `--file=${output}`,
    `--dbname=${database}`,
  ];
}

export function buildRestoreArgs(database, input) {
  return [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    `--dbname=${database}`,
    input,
  ];
}

function parseOptions(args) {
  return Object.fromEntries(
    args.map((arg) => {
      const [key, ...value] = arg.replace(/^--/, '').split('=');
      return [key, value.length ? value.join('=') : true];
    }),
  );
}

function run(command, args, connectionEnv) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...connectionEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with code ${result.status ?? 'unknown'}.`,
    );
  }
}

function checksum(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function backup(options) {
  const connection = parsePostgresConnection(
    process.env.BACKUP_DATABASE_URL ??
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL,
  );
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const output = resolve(
    String(options.output ?? `backups/documind-${stamp}.dump`),
  );
  if (existsSync(output) && !options.force) {
    throw new Error(
      `Backup already exists: ${output}. Use --force to replace it.`,
    );
  }
  mkdirSync(dirname(output), { recursive: true });
  const temporary = resolve(
    dirname(output),
    `.${basename(output)}.${process.pid}.tmp`,
  );
  try {
    run(
      'pg_dump',
      buildBackupArgs(connection.database, temporary),
      connection.env,
    );
    if (existsSync(output)) rmSync(output);
    renameSync(temporary, output);
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary);
    throw error;
  }
  const metadata = {
    format: 'postgresql-custom',
    database: connection.database,
    createdAt: new Date().toISOString(),
    sha256: checksum(output),
  };
  writeFileSync(`${output}.json`, `${JSON.stringify(metadata, null, 2)}\n`, {
    flag: 'w',
  });
  console.log(`Backup created: ${output}`);
}

function restore(options) {
  const input = resolve(String(options.input ?? ''));
  if (!options.input || !existsSync(input)) {
    throw new Error('Restore requires an existing --input=/path/file.dump.');
  }
  const connection = parsePostgresConnection(process.env.RESTORE_DATABASE_URL);
  assertRestoreConfirmation(connection.database, options, process.env.NODE_ENV);
  const metadataPath = `${input}.json`;
  if (existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    if (metadata.sha256 !== checksum(input)) {
      throw new Error('Backup checksum verification failed.');
    }
  }
  run('pg_restore', ['--list', input], connection.env);
  run(
    'pg_restore',
    buildRestoreArgs(connection.database, input),
    connection.env,
  );
  console.log(`Restore completed for database: ${connection.database}`);
}

function main() {
  const [operation, ...rawOptions] = process.argv.slice(2);
  const options = parseOptions(rawOptions);
  if (operation === 'backup') backup(options);
  else if (operation === 'restore') restore(options);
  else
    throw new Error(
      'Usage: database-maintenance.mjs <backup|restore> [options]',
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
