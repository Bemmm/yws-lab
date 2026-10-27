import { PlanPreview } from "@/components/plans/workspace";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PlanPreview id={id}/>}
