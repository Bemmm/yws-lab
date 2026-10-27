import { assertOrigin, database, empty, fail, json, requireUser } from "@/lib/server/api";
import { createShare, revokeShare } from "@/lib/server/plan-service";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,{params}:Context){try{assertOrigin(request);const user=await requireUser(),{id}=await params;return json(await createShare(database(),user.id,id,new URL(request.url).origin),201)}catch(error){return fail(error)}}
export async function DELETE(request:Request,{params}:Context){try{assertOrigin(request);const user=await requireUser(),{id}=await params;await revokeShare(database(),user.id,id);return empty()}catch(error){return fail(error)}}
