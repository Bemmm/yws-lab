import { PlanPreview } from "@/components/plans/workspace";
export const metadata={robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PlanPreview token={token}/>}
