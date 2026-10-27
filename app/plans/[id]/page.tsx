import { PlanBuilder } from "@/components/builder/plan-builder";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PlanBuilder id={id}/>}
