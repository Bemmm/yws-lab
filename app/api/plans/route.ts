import { assertOrigin, bodyObject, database, fail, json, requireUser } from "@/lib/server/api";
import { createPlan, listPlans } from "@/lib/server/plan-service";
export async function GET(){try{const user=await requireUser();return json(await listPlans(database(),user.id))}catch(error){return fail(error)}}
export async function POST(request:Request){try{assertOrigin(request);const user=await requireUser();return json(await createPlan(database(),user.id,await bodyObject(request)),201)}catch(error){return fail(error)}}
