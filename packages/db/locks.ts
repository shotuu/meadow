import { createHash } from "node:crypto";
import { Pool } from "pg";

let pool: Pool | undefined;
/** Session locks span provider calls without holding a database transaction open. */
export async function withAdvisoryLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const client = await pool.connect();
  const lockId = createHash("sha256").update(key).digest().readBigInt64BE().toString();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS locked", [lockId]);
    locked = result.rows[0].locked;
    if (!locked) throw new Error("This operation is already running; try again shortly");
    return await work();
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockId]);
      client.release();
    } catch { client.release(true); }
  }
}

export async function closeLockPool(): Promise<void> { await pool?.end(); pool = undefined; }
