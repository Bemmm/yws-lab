import { assertOrigin, database, fail, json, requireUser } from "@/lib/server/api";
import { duplicatePlan } from "@/lib/server/plan-service";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertOrigin(request);const user=await requireUser(),{id}=await params;return json(await duplicatePlan(database(),user.id,id),201)}catch(error){return fail(error)}}
