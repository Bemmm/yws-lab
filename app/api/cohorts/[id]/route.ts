import { progressApi } from "@/lib/server/progress-service";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "cohort", await context.params); }
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "cohort", await context.params); }
