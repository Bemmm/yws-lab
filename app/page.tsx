import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthUser();
  redirect(user ? "/plans" : "/login");
}
