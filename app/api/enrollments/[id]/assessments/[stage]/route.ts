import { progressApi } from "@/lib/server/progress-service";
export async function GET(request: Request, context: { params: Promise<{ id: string; stage: string }> }) { return progressApi(request, "assessment", await context.params); }
export async function PUT(request: Request, context: { params: Promise<{ id: string; stage: string }> }) { return progressApi(request, "assessment", await context.params); }
