import { resetDatabase } from "@/lib/db/migrate";
import { getIncident } from "@/lib/repo/incidents";
import type { IncidentStatus } from "@/lib/db/types";

export { resetDatabase };

export async function statusOf(id: string): Promise<IncidentStatus> {
  const inc = await getIncident(id);
  if (!inc) throw new Error(`incident ${id} not found`);
  return inc.status;
}
