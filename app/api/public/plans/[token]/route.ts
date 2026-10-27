import { database, fail, json } from "@/lib/server/api";
import { publicPlan } from "@/lib/server/plan-service";
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){try{const {token}=await params;const response=json(await publicPlan(database(),token));response.headers.set("X-Robots-Tag","noindex, nofollow");response.headers.set("Referrer-Policy","no-referrer");return response}catch(error){const response=fail(error);response.headers.set("X-Robots-Tag","noindex, nofollow");response.headers.set("Referrer-Policy","no-referrer");return response}}
