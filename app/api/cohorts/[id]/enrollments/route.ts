import { progressApi } from "@/lib/server/progress-service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "enrollments", await context.params); }
