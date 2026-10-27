'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BuilderClient } from './core/builder-client'
import { BuilderStringsProvider, DEFAULT_BUILDER_STRINGS, UK_BUILDER_STRINGS } from './core/_lib/strings'
import type { Program } from './core/_lib/use-program'
import { useLocale } from '@/components/i18n/language'

type Plan = { id:string; title:string; description:string; program:Program; version:number; shareActive:boolean }
async function request<T>(url:string, method='GET', body?:unknown):Promise<T>{
  const response=await fetch(url,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined})
  if(!response.ok) throw new Error(response.status===409?'Программу изменили в другой вкладке. Обновите страницу.':'Не удалось сохранить программу.')
  return response.status===204?undefined as T:response.json()
}

export function PlanBuilder({id}:{id:string}) {
  const [plan,setPlan]=useState<Plan|null>(null)
  const [error,setError]=useState('')
  const [version,setVersion]=useState(0)
  const {locale}=useLocale()
  useEffect(()=>{let live=true;request<Plan>(`/api/plans/${id}`).then(value=>{if(live){setPlan(value);setVersion(value.version)}}).catch(e=>live&&setError(e.message));return()=>{live=false}},[id])
  if(error)return <main className="min-h-dvh p-8"><Link href="/plans">← К программам</Link><p role="alert" className="mt-8 text-red-700">{error}</p></main>
  if(!plan)return <main className="min-h-dvh animate-pulse bg-stone-100" />
  const save=async(program:Program)=>{const response=await request<Plan>(`/api/plans/${id}`,'PATCH',{expectedVersion:version,title:program.title,description:program.description||'',program});setVersion(response.version);setPlan(response);return {status:'ok'}}
  const share={initialToken:null,enable:async()=>{const result=await request<{shareToken:string}>(`/api/plans/${id}/share`,'POST');return {status:'ok',shareToken:result.shareToken}},disable:async()=>request(`/api/plans/${id}/share`,'DELETE')}
  return <div className="min-h-dvh bg-[#f6f7f8] p-0 lg:p-3">
    <div className="mx-auto mb-2 flex max-w-[1800px] items-center justify-between px-4 pt-3 lg:px-2">
      <Link className="text-sm font-medium text-neutral-600 hover:text-neutral-950" href="/plans">← К программам</Link>
      <span className="text-xs font-medium text-neutral-500">YWS Lab</span>
    </div>
    <BuilderStringsProvider value={locale==='ru'?DEFAULT_BUILDER_STRINGS:UK_BUILDER_STRINGS}>
      <BuilderClient initialProgram={plan.program} save={save} share={share} previewHref={()=>`/plans/${id}/preview`} brand={{href:'/plans',label:'YWS Lab',icon:<span aria-hidden="true">Y</span>}} />
    </BuilderStringsProvider>
  </div>
}
