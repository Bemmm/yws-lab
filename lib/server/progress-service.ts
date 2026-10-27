import { COMPETENCIES, COMPETENCY_CODES, DYNAMICS_LABELS, STARTING_PROFILES, type Scores } from "@/lib/competencies";
import { ApiError, assertOrigin, bodyObject, database, fail, json, requireMethodologist, stringField } from "./api";

type CohortRow = { id: string; name: string; status: string; start_date: string | null; end_date: string | null; version: number; created_at: number; updated_at: number };
type EnrollmentRow = { id: string; cohort_id: string; student_id: string; starting_profile: string; archived: number; student_name: string; student_status: string };
type AssessmentRow = { id: string; enrollment_id: string; stage: string; scores_json: string; version: number; updated_at: number; updated_by: string };
export type Assessment = { stage: string; scores: Scores; version: number; updatedAt?: number; updatedBy?: string };
export function stageIds(modules: number[]) { return ["point0", ...[...modules].sort((a, b) => a - b).map(n => `module-${n}`), ...(modules.length ? ["final"] : [])]; }
const scoreCount = (scores: Scores) => COMPETENCY_CODES.filter(code => scores[code] != null).length;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
export function validateScores(value: unknown): Scores {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Потрібен набір оцінок.");
  const scores: Scores = {};
  for (const [code, score] of Object.entries(value)) {
    if (!COMPETENCY_CODES.includes(code as typeof COMPETENCY_CODES[number])) throw new ApiError(400, "Невідома компетентність.");
    if (score !== null && (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 10)) throw new ApiError(400, "Оцінка має бути цілим числом 0–10 або порожньою.");
    scores[code as keyof Scores] = score as number | null;
  }
  return scores;
}
export function calculateProgress(assessments: Assessment[], modules: number[]) {
  const order = stageIds(modules);
  const sorted = [...assessments].filter(a => order.includes(a.stage)).sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  const complete = sorted.filter(a => scoreCount(a.scores) === 16);
  const point0 = sorted.find(a => a.stage === "point0");
  const latest = complete.at(-1);
  const level = (a: Assessment) => mean(COMPETENCY_CODES.map(code => a.scores[code]!));
  const currentLevel = latest ? level(latest) : null;
  let key: keyof typeof DYNAMICS_LABELS = "point0_incomplete", reason: string | null = null;
  if (point0 && scoreCount(point0.scores) === 16) {
    key = "point0_only";
    if (complete.length >= 2) {
      const previous = complete[complete.length - 2], current = complete[complete.length - 1];
      // Use integer totals for boundary classification; binary floating subtraction
      // must not turn an exact 0.3 increase into 0.2999999999999998.
      const total = (a: Assessment) => COMPETENCY_CODES.reduce((sum, code) => sum + a.scores[code]!, 0);
      const deltaTotal = total(current) - total(previous);
      const drops = COMPETENCIES.filter(c => current.scores[c.code]! - previous.scores[c.code]! <= -2);
      if (deltaTotal < 0 || drops.length) {
        key = "attention";
        reason = deltaTotal < 0 ? `Загальний рівень змінився на ${(deltaTotal / 16).toLocaleString("uk-UA", { maximumFractionDigits: 1 })}` : `${drops[0].label}: ${current.scores[drops[0].code]! - previous.scores[drops[0].code]!}${drops.length > 1 ? `; ще ${drops.length - 1} компетентностей` : ""}`;
      } else if (deltaTotal * 10 < 3 * 16) key = "stagnation";
      else if (deltaTotal * 10 < 15 * 16) key = "steady_growth";
      else key = "rapid_growth";
    }
  }
  const competencies = COMPETENCIES.map(c => {
    const scored = sorted.filter(a => a.scores[c.code] != null), current = scored.at(-1), previous = scored.at(-2);
    const value = current?.scores[c.code] ?? null, initial = point0?.scores[c.code];
    return { ...c, value, gain: value != null && initial != null ? value - initial : null, priorChange: value != null && previous ? value - previous.scores[c.code]! : null };
  });
  return { currentStage: sorted.filter(a => scoreCount(a.scores) > 0).at(-1)?.stage ?? null, latestCompleteStage: latest?.stage ?? null,
    currentLevel, gain: latest && latest.stage !== "point0" && point0 && scoreCount(point0.scores) === 16 ? level(latest) - level(point0) : null,
    basicLevel: latest ? mean(COMPETENCIES.filter(c => c.group === "basic").map(c => latest.scores[c.code]!)) : null,
    systemLevel: latest ? mean(COMPETENCIES.filter(c => c.group === "system").map(c => latest.scores[c.code]!)) : null,
    dynamics: { key, label: DYNAMICS_LABELS[key], reason }, competencies,
    stages: order.map(stage => { const assessment = sorted.find(a => a.stage === stage); const count = assessment ? scoreCount(assessment.scores) : 0; return { stage, assessed: count, complete: count === 16, level: assessment && count === 16 ? level(assessment) : null }; }),
  };
}
const assessmentView = (row: AssessmentRow): Assessment => ({ stage: row.stage, scores: JSON.parse(row.scores_json), version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by });
const expected = (body: Record<string, unknown>) => { const version = body.expectedVersion; if (!Number.isInteger(version) || (version as number) < 0) throw new ApiError(400, "Потрібна актуальна версія запису."); return version as number; };
const optionalText = (value: unknown, max: number) => value == null || value === "" ? null : stringField(value, 0, max, "текст");
const validDate = (value: unknown) => { const date = optionalText(value, 10); if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new ApiError(400, "Некоректна дата."); return date; };
const writable = (cohort: {status:string}) => { if (cohort.status !== "active") throw new ApiError(409, "Архівна когорта доступна лише для перегляду."); };
function auditStatement(db: D1Database, actor: string, action: string, entity: string, id: string, metadata: unknown, conditional = false) {
  return db.prepare(`INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, metadata_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?${conditional ? " WHERE changes() = 1" : ""}`).bind(crypto.randomUUID(), actor, action, entity, id, JSON.stringify(metadata), Date.now());
}
export async function getCohort(db: D1Database, id: string) {
  const row = await db.prepare("SELECT * FROM cohorts WHERE id = ?").bind(id).first<CohortRow>();
  if (!row) throw new ApiError(404, "Не знайдено.");
  const modules = await db.prepare("SELECT module_number FROM cohort_modules WHERE cohort_id = ? ORDER BY module_number").bind(id).all<{module_number:number}>();
  return { id: row.id, name: row.name, status: row.status, startDate: row.start_date, endDate: row.end_date, version: row.version, modules: modules.results.map(m => m.module_number) };
}
async function getEnrollment(db: D1Database, id: string) {
  const row = await db.prepare("SELECT e.*, s.name AS student_name, s.status AS student_status FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.id = ?").bind(id).first<EnrollmentRow>();
  if (!row) throw new ApiError(404, "Не знайдено.");
  return row;
}
const enrollmentView = (row: EnrollmentRow) => ({ id:row.id, cohortId:row.cohort_id, studentId:row.student_id, studentName:row.student_name, startingProfile:row.starting_profile, archived:!!row.archived, studentStatus:row.student_status });
async function getAssessments(db: D1Database, enrollmentId: string) { return (await db.prepare("SELECT * FROM assessments WHERE enrollment_id = ?").bind(enrollmentId).all<AssessmentRow>()).results.map(assessmentView); }
export type ProgressAction = "cohorts" | "cohort" | "modules" | "students" | "student" | "enrollments" | "enrollment" | "overview" | "assessment" | "progress";
export async function progressApi(request: Request, action: ProgressAction, params: Record<string,string> = {}) {
  try {
    const actor = await requireMethodologist();
    const db = database(), method = request.method;
    if (method !== "GET") assertOrigin(request);
    const body = method !== "GET" ? await bodyObject(request) : {};
    const id = params.id;
    if (action === "cohorts") {
      if (method === "GET") {
        const rows = (await db.prepare("SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.cohort_id = c.id AND e.archived = 0) AS student_count FROM cohorts c ORDER BY created_at DESC").all<CohortRow & {student_count:number}>()).results;
        return json({ items: await Promise.all(rows.map(async r => ({ ...await getCohort(db,r.id), studentCount:r.student_count }))) });
      }
      const name = stringField(body.name,1,80,"назва"), cohortId = crypto.randomUUID(), now = Date.now(), startDate = validDate(body.startDate), endDate = validDate(body.endDate);
      if (startDate && endDate && endDate < startDate) throw new ApiError(400,"Завершення має бути після початку.");
      await db.batch([db.prepare("INSERT INTO cohorts (id,name,status,start_date,end_date,version,created_at,updated_at) VALUES (?,?,'active',?,?,1,?,?)").bind(cohortId,name,startDate,endDate,now,now),auditStatement(db,actor.id,"cohort.created","cohort",cohortId,{})]);
      return json(await getCohort(db,cohortId),201);
    }
    if (action === "cohort") {
      const cohort = await getCohort(db,id);
      if (method === "GET") return json(cohort);
      const version = expected(body), name = body.name === undefined ? cohort.name : stringField(body.name,1,80,"назва"), status = body.status ?? cohort.status;
      if (status !== "active" && status !== "archived") throw new ApiError(400,"Некоректний статус.");
      const result = await db.batch([db.prepare("UPDATE cohorts SET name=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(name,status,Date.now(),id,version),auditStatement(db,actor.id,"cohort.updated","cohort",id,{previousVersion:version},true)]);
      if (!result[0].meta.changes) throw new ApiError(409,"Когорту вже змінено. Оновіть дані.");
      return json(await getCohort(db,id));
    }
    if (action === "modules") {
      const cohort = await getCohort(db,id); writable(cohort); const version = expected(body);
      if (version !== cohort.version) throw new ApiError(409,"Модулі вже змінено. Оновіть дані.");
      const numbers = method === "DELETE" ? [body.module] : body.modules;
      if (!Array.isArray(numbers) || !numbers.length || numbers.length > 12 || new Set(numbers).size !== numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1 || n > 12)) throw new ApiError(400,"Оберіть різні модулі від 1 до 12.");
      const moduleNumbers = numbers as number[];
      if (method === "DELETE") {
        const scored = await db.prepare("SELECT a.scores_json FROM assessments a JOIN enrollments e ON e.id=a.enrollment_id WHERE e.cohort_id=? AND a.stage=?").bind(id,`module-${moduleNumbers[0]}`).all<{scores_json:string}>();
        if (scored.results.some(r => scoreCount(JSON.parse(r.scores_json)) > 0)) throw new ApiError(409,"Модуль має оцінювання. Спочатку очистіть їх через форму оцінювання.");
      }
      const statements = moduleNumbers.map(n => method === "DELETE"
        ? db.prepare("DELETE FROM cohort_modules WHERE cohort_id=? AND module_number=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=? AND status='active') AND NOT EXISTS(SELECT 1 FROM assessments a JOIN enrollments e ON e.id=a.enrollment_id WHERE e.cohort_id=? AND a.stage=? AND EXISTS(SELECT 1 FROM json_each(a.scores_json) WHERE value IS NOT NULL))").bind(id,n,id,version,id,`module-${n}`)
        : db.prepare("INSERT OR IGNORE INTO cohort_modules (cohort_id,module_number) SELECT ?,? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=? AND status='active')").bind(id,n,id,version));
      // All conditional writes and CAS run in one serialized, atomic D1 batch.
      const removalGate = method === "DELETE" ? " AND NOT EXISTS(SELECT 1 FROM assessments a JOIN enrollments e ON e.id=a.enrollment_id WHERE e.cohort_id=? AND a.stage=? AND EXISTS(SELECT 1 FROM json_each(a.scores_json) WHERE value IS NOT NULL))" : "";
      const results = await db.batch([...statements,db.prepare("UPDATE cohorts SET version=version+1,updated_at=? WHERE id=? AND version=? AND status='active'" + removalGate).bind(Date.now(),id,version,...(method === "DELETE" ? [id,`module-${moduleNumbers[0]}`] : [])),auditStatement(db,actor.id,method === "DELETE" ? "module.removed" : "modules.added","cohort",id,{modules:moduleNumbers},true)]);
      if (!results[statements.length].meta.changes) throw new ApiError(409,"Модулі вже змінено. Оновіть дані.");
      if (method === "DELETE" && !results[0].meta.changes && cohort.modules.includes(moduleNumbers[0])) throw new ApiError(409,"Модуль уже має оцінювання і не видалений.");
      return json(await getCohort(db,id));
    }
    if (action === "students") {
      if (method === "GET") return json({items:(await db.prepare("SELECT id,name,contact,note,status FROM students WHERE status='active' ORDER BY name COLLATE NOCASE").all()).results});
      const name=stringField(body.name,1,120,"ім’я"), contact=optionalText(body.contact,240), note=optionalText(body.note,4000) || "", studentId=crypto.randomUUID(), now=Date.now();
      if (contact && await db.prepare("SELECT id FROM students WHERE contact=? COLLATE NOCASE").bind(contact).first()) throw new ApiError(409,"Студент із таким контактом уже існує. Оберіть його в реєстрі.");
      await db.batch([db.prepare("INSERT INTO students (id,name,contact,note,status,created_at,updated_at) SELECT ?,?,?,?,'active',?,? WHERE ? IS NULL OR NOT EXISTS(SELECT 1 FROM students WHERE contact=? COLLATE NOCASE)").bind(studentId,name,contact,note,now,now,contact,contact),auditStatement(db,actor.id,"student.created","student",studentId,{},true)]);
      if (!await db.prepare("SELECT id FROM students WHERE id=?").bind(studentId).first()) throw new ApiError(409,"Student contact already exists.");
      return json({id:studentId,name,contact,note,status:"active"},201);
    }
    if (action === "student") {
      const current = await db.prepare("SELECT id,name,contact,note,status FROM students WHERE id=?").bind(id).first<{id:string;name:string;contact:string|null;note:string;status:string}>();
      if (!current) throw new ApiError(404,"Not found.");
      if (method === "GET") return json(current);
      const name = body.name === undefined ? current.name : stringField(body.name,1,120,"name");
      const contact = body.contact === undefined ? current.contact : optionalText(body.contact,240);
      const note = body.note === undefined ? current.note : optionalText(body.note,4000) || "";
      const status = body.status ?? current.status;
      if (status !== "active" && status !== "archived") throw new ApiError(400,"Invalid status.");
      if (contact && await db.prepare("SELECT id FROM students WHERE contact=? COLLATE NOCASE AND id<>?").bind(contact,id).first()) throw new ApiError(409,"Student contact already exists.");
      const results = await db.batch([db.prepare("UPDATE students SET name=?,contact=?,note=?,status=?,updated_at=? WHERE id=? AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM students WHERE contact=? COLLATE NOCASE AND id<>?))").bind(name,contact,note,status,Date.now(),id,contact,contact,id),auditStatement(db,actor.id,"student.updated","student",id,{},true)]);
      if (!results[0].meta.changes) throw new ApiError(409,"Student contact already exists.");
      return json({id,name,contact,note,status});
    }
    if (action === "enrollments") {
      const cohort=await getCohort(db,id); writable(cohort);
      const studentId=stringField(body.studentId,1,100,"студент"), profile=body.startingProfile;
      if (!STARTING_PROFILES.includes(profile as typeof STARTING_PROFILES[number])) throw new ApiError(400,"Оберіть стартовий профіль.");
      if (!await db.prepare("SELECT id FROM students WHERE id=? AND status='active'").bind(studentId).first()) throw new ApiError(404,"Не знайдено.");
      if (await db.prepare("SELECT id FROM enrollments WHERE cohort_id=? AND student_id=?").bind(id,studentId).first()) throw new ApiError(409,"Студент уже в цій когорті.");
      const enrollmentId=crypto.randomUUID();
      try { await db.batch([db.prepare("INSERT INTO enrollments (id,cohort_id,student_id,starting_profile,archived,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status='active')").bind(enrollmentId,id,studentId,profile,Date.now(),id),auditStatement(db,actor.id,"enrollment.created","enrollment",enrollmentId,{},true)]); }
      catch { throw new ApiError(409,"Студент уже в цій когорті або когорта змінилася."); }
      return json(enrollmentView(await getEnrollment(db,enrollmentId)),201);
    }
    if (action === "overview") {
      const cohort=await getCohort(db,id);
      const rows=(await db.prepare("SELECT e.*,s.name AS student_name,s.status AS student_status FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.cohort_id=? AND e.archived=0 ORDER BY s.name COLLATE NOCASE").bind(id).all<EnrollmentRow>()).results;
      const all=(await db.prepare("SELECT a.* FROM assessments a JOIN enrollments e ON e.id=a.enrollment_id WHERE e.cohort_id=? AND e.archived=0").bind(id).all<AssessmentRow>()).results;
      const items=rows.map(row=>({...enrollmentView(row),...calculateProgress(all.filter(a=>a.enrollment_id===row.id).map(assessmentView),cohort.modules)}));
      const dynamicsCounts:Record<string,number>={}, completionByStage:Record<string,number>={};
      for (const stage of stageIds(cohort.modules)) completionByStage[stage]=0;
      for (const item of items) { dynamicsCounts[item.dynamics.label]=(dynamicsCounts[item.dynamics.label]||0)+1; for(const stage of item.stages) if(stage.complete) completionByStage[stage.stage]++; }
      const competencyGains=Object.fromEntries(COMPETENCIES.map(c=>{const values=items.map(i=>i.competencies.find(x=>x.code===c.code)!.gain).filter((v):v is number=>v!=null); return [c.code,{mean:values.length?mean(values):null,count:values.length}];}));
      return json({cohort,enrollments:items,summary:{dynamicsCounts,completionByStage,competencyGains}});
    }
    if (action === "progress" || action === "assessment" || action === "enrollment") {
      const enrollment=await getEnrollment(db,id), cohort=await getCohort(db,enrollment.cohort_id), assessments=await getAssessments(db,id);
      if (action === "progress") return json({enrollment:enrollmentView(enrollment),cohort,assessments,metrics:calculateProgress(assessments,cohort.modules)});
      if (action === "enrollment") {
        writable(cohort);
        const profile=body.startingProfile ?? enrollment.starting_profile;
        if (!STARTING_PROFILES.includes(profile as typeof STARTING_PROFILES[number])) throw new ApiError(400,"Некоректний профіль.");
        const archived=method === "DELETE" ? 1 : body.archived === undefined ? enrollment.archived : body.archived ? 1 : 0;
        await db.batch([db.prepare("UPDATE enrollments SET starting_profile=?,archived=? WHERE id=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status='active')").bind(profile,archived,id,cohort.id),auditStatement(db,actor.id,"enrollment.updated","enrollment",id,{},true)]);
        return json(enrollmentView(await getEnrollment(db,id)));
      }
      const stage=params.stage;
      if (!stageIds(cohort.modules).includes(stage)) throw new ApiError(404,"Не знайдено.");
      const current=assessments.find(a=>a.stage===stage);
      if (method === "GET") return json(current || {stage,scores:{},version:0});
      writable(cohort); if(enrollment.archived || enrollment.student_status !== "active") throw new ApiError(409,"Архівний запис доступний лише для перегляду.");
      const version=expected(body), scores=validateScores(body.scores);
      if ((current?.version || 0)!==version) throw new ApiError(409,"Оцінювання змінив інший методолог. Оновіть версію.");
      const order=stageIds(cohort.modules), previousStage=order[order.indexOf(stage)-1];
      if(stage!=="point0" && !scoreCount(current?.scores || {}) && !scoreCount(assessments.find(a=>a.stage===previousStage)?.scores || {})) throw new ApiError(409,"Спершу внесіть хоча б одну оцінку на попередньому етапі.");
      const now=Date.now(), assessmentId=crypto.randomUUID();
      const stageGate=stage === "point0" ? "1=1" : "(EXISTS(SELECT 1 FROM assessments WHERE enrollment_id=? AND stage=? AND EXISTS(SELECT 1 FROM json_each(scores_json) WHERE value IS NOT NULL)) OR EXISTS(SELECT 1 FROM assessments WHERE enrollment_id=? AND stage=? AND EXISTS(SELECT 1 FROM json_each(scores_json) WHERE value IS NOT NULL)))";
      const gateParams=stage === "point0" ? [] : [id,stage,id,previousStage];
      const statement=version===0
        ? db.prepare(`INSERT OR IGNORE INTO assessments (id,enrollment_id,stage,scores_json,version,updated_at,updated_by) SELECT ?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status='active' AND version=?) AND EXISTS(SELECT 1 FROM enrollments WHERE id=? AND archived=0) AND ${stageGate}`).bind(assessmentId,id,stage,JSON.stringify(scores),now,actor.id,cohort.id,cohort.version,id,...gateParams)
        : db.prepare(`UPDATE assessments SET scores_json=?,version=version+1,updated_at=?,updated_by=? WHERE enrollment_id=? AND stage=? AND version=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status='active' AND version=?) AND EXISTS(SELECT 1 FROM enrollments WHERE id=? AND archived=0) AND ${stageGate}`).bind(JSON.stringify(scores),now,actor.id,id,stage,version,cohort.id,cohort.version,id,...gateParams);
      const results=await db.batch([statement,auditStatement(db,actor.id,"assessment.saved","assessment",`${id}:${stage}`,{stage,enrollmentId:id,previousScores:current?.scores || {},scores,previousVersion:version},true)]);
      if(!results[0].meta.changes) throw new ApiError(409,"Запис уже змінився або етап більше недоступний. Оновіть дані.");
      return json({stage,scores,version:version+1,updatedAt:now,updatedBy:actor.id});
    }
    throw new ApiError(404,"Не знайдено.");
  } catch(error) { return fail(error); }
}
