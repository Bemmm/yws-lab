import { progressApi } from "@/lib/server/progress-service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "modules", await context.params); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "modules", await context.params); }
