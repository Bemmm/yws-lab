import { database, fail, json, requireUser } from "@/lib/server/api";
import { listCatalog } from "@/lib/server/plan-service";
export async function GET(request:Request){try{await requireUser();return json(await listCatalog(database(),new URL(request.url)))}catch(error){return fail(error)}}
