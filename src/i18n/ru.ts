import type { Dictionary } from "./uk";

export const ru: Dictionary = {
  app: { name: "YWS Lab", tagline: "Инструменты для методистов и преподавателей YWS" },
  nav: { plans: "Планы", progress: "Прогресс", main: "Главная навигация" },
  auth: {
    signIn: "Войти",
    signOut: "Выйти",
    continueWithTelegram: "Продолжить через Telegram",
    loginTitle: "Вход в YWS Lab",
    loginHint: "Войдите через свой аккаунт Telegram. Пароль не нужен — подтверждение приходит в Telegram.",
    errors: {
      cancelled: "Вход отменён. Попробуйте ещё раз, когда будете готовы.",
      state: "Сессия входа устарела или недействительна. Попробуйте ещё раз.",
      provider: "Telegram сейчас не отвечает. Попробуйте ещё раз через минуту.",
      token: "Не удалось подтвердить вход в Telegram. Попробуйте ещё раз.",
      disabled: "Эта учётная запись отключена. Обратитесь к администратору школы.",
      config: "Вход через Telegram ещё не настроен на сервере.",
    },
    retry: "Попробовать ещё раз",
    accountMenu: "Учётная запись",
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
