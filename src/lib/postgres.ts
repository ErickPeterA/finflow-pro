import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// O restante da aplicação segue o mesmo contrato da API do Supabase: campos
// date/timestamp são strings ISO. Versões recentes do `pg` podem convertê-los
// em objetos Date, quebrando operações de texto usadas nas telas (.slice,
// .localeCompare etc.) e ainda aplicando fuso horário a datas sem horário.
const POSTGRES_DATE_OID = 1082;
const POSTGRES_TIMESTAMP_OID = 1114;
const POSTGRES_TIMESTAMPTZ_OID = 1184;

types.setTypeParser(POSTGRES_DATE_OID, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMP_OID, (value) => value);
types.setTypeParser(POSTGRES_TIMESTAMPTZ_OID, (value) => value);

let pool: Pool | undefined;

export function getPostgresPool() {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("Missing DATABASE_URL.");
    pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return getPostgresPool().query<T>(text, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
