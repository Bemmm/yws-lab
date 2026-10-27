import { assertOrigin, bodyObject, database, empty, fail, json, requireUser } from "@/lib/server/api";
import { deletePlan, ownPlan, patchPlan, serializePlan } from "@/lib/server/plan-service";
type Context={params:Promise<{id:string}>};
export async function GET(_:Request,{params}:Context){try{const user=await requireUser(),{id}=await params,db=database();return json(await serializePlan(db,await ownPlan(db,user.id,id)))}catch(error){return fail(error)}}
export async function PATCH(request:Request,{params}:Context){try{assertOrigin(request);const user=await requireUser(),{id}=await params;return json(await patchPlan(database(),user.id,id,await bodyObject(request)))}catch(error){return fail(error)}}
export async function DELETE(request:Request,{params}:Context){try{assertOrigin(request);const user=await requireUser(),{id}=await params;await deletePlan(database(),user.id,id);return empty()}catch(error){return fail(error)}}
