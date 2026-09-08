import type { PoolClient } from "pg";
import { query } from "./postgres";

export async function assertEmpresaAccess(userId: string, empresaId: string, client?: PoolClient) {
  const executor = client ?? { query };
  const result = await executor.query<{ allowed: boolean }>(
    "select public.can_access_empresa($1::uuid, $2::uuid) as allowed",
    [userId, empresaId],
  );
  if (!result.rows[0]?.allowed) throw new Error("Você não tem acesso a esta empresa.");
}
