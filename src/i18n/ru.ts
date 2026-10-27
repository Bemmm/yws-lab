import type { Dictionary } from "./uk";

export const ru: Dictionary = {
  app: { name: "YWS Lab", tagline: "Инструменты для методистов и преподавателей YWS" },
  nav: { plans: "Планы", progress: "Прогресс", main: "Главная навигация" },
  auth: {
    signIn: "Войти",
    signOut: "Выйти",
    continueWithTelegram: "Продолжить через Telegram",
    loginTitle: "Вход в YWS Lab",
    loginHint: "Вход через Telegram скоро будет доступен.",
    guest: "Гость",
  },
  language: { label: "Язык", uk: "Українська", ru: "Русский" },
  plans: { title: "Планы тренировок", placeholder: "Здесь появятся ваши планы тренировок." },
  notFound: {
    title: "Страница не найдена",
    body: "Такой страницы нет или она вам недоступна.",
    backHome: "К планам",
  },
};
