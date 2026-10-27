import { progressApi } from "@/lib/server/progress-service";
export async function GET(request: Request) { return progressApi(request, "students"); }
export async function POST(request: Request) { return progressApi(request, "students"); }
