export const uk = {
  app: { name: "YWS Lab", tagline: "Інструменти для методистів і викладачів YWS" },
  nav: { plans: "Плани", progress: "Прогрес", main: "Головна навігація" },
  auth: {
    signIn: "Увійти",
    signOut: "Вийти",
    continueWithTelegram: "Продовжити через Telegram",
    loginTitle: "Вхід до YWS Lab",
    loginHint: "Вхід через Telegram буде доступний найближчим часом.",
    guest: "Гість",
  },
  language: { label: "Мова", uk: "Українська", ru: "Русский" },
  plans: { title: "Плани тренувань", placeholder: "Тут з’являться ваші плани тренувань." },
  notFound: {
    title: "Сторінку не знайдено",
    body: "Такої сторінки немає або вона вам недоступна.",
    backHome: "До планів",
  },
};

export type Dictionary = typeof uk;
