import { PlanPreviewView } from "@/components/builder/plan-preview";
export const metadata={robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PlanPreviewView token={token}/>}
