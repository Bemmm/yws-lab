'use client'

import { useEffect,useState } from 'react'
import { PreviewClient } from './core/preview-client'
import { BuilderStringsProvider,DEFAULT_BUILDER_STRINGS } from './core/_lib/strings'
import type { Program } from './core/_lib/use-program'

export function PlanPreviewView({id,token}:{id?:string;token?:string}){
  const [program,setProgram]=useState<Program|null>(null)
  useEffect(()=>{const url=token?`/api/public/plans/${token}`:`/api/plans/${id}`;fetch(url).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<{program:Program;plan?:{program:Program}}>}).then(data=>setProgram(token?data.plan?.program||null:data.program)).catch(()=>setProgram(null))},[id,token])
  return <BuilderStringsProvider value={DEFAULT_BUILDER_STRINGS}><PreviewClient initialProgram={program} publicView={!!token} backHref={id?`/plans/${id}`:'/plans'} /></BuilderStringsProvider>
}
