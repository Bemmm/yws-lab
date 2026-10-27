export const COMPETENCIES = [
  { code: "speech_voice", label: "Мовлення та голос", group: "basic" },
  { code: "relay_function", label: "Релейна функція", group: "basic" },
  { code: "confidence", label: "Впевненість", group: "basic" },
  { code: "audience_contact", label: "Контакт з аудиторією", group: "basic" },
  { code: "physical_preparation", label: "Фізична підготовка", group: "basic" },
  { code: "coordination", label: "Координація", group: "basic" },
  { code: "demonstration", label: "Здатність демонструвати", group: "basic" },
  { code: "rhythm", label: "Відчуття ритму", group: "basic" },
  { code: "plasticity", label: "Пластичність рухів", group: "basic" },
  { code: "mode", label: "Розуміння та володіння режимом", group: "system" },
  { code: "command_timing", label: "Час подачі команд", group: "system" },
  { code: "command_quality", label: "Якість команд", group: "system" },
  { code: "group_attention", label: "Керування увагою групи", group: "system" },
  { code: "exercise_purpose", label: "Розуміння мети вправи", group: "system" },
  { code: "transitions", label: "Переходи", group: "system" },
  { code: "system_principles", label: "Дотримання принципів системи", group: "system" },
] as const;
export const COMPETENCY_CODES = COMPETENCIES.map(item => item.code);
export type CompetencyCode = typeof COMPETENCIES[number]["code"];
export type Scores = Partial<Record<CompetencyCode, number | null>>;
export const STARTING_PROFILES = ["polishing", "reframing", "from_zero"] as const;
export const DYNAMICS_LABELS = {
  point0_incomplete: "Point 0 не завершено", point0_only: "Поки що лише Point 0",
  attention: "Потребує уваги", stagnation: "Без суттєвих змін", steady_growth: "Стабільне зростання", rapid_growth: "Стрімке зростання",
} as const;
