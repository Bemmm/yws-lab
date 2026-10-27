import { progressApi } from "@/lib/server/progress-service";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "progress", await context.params); }
