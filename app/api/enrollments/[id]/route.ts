import { progressApi } from "@/lib/server/progress-service";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "enrollment", await context.params); }
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return progressApi(request, "enrollment", await context.params); }
