export const uk = {
  app: { name: "YWS Lab", tagline: "Інструменти для методистів і викладачів YWS" },
  nav: { plans: "Плани", progress: "Прогрес", main: "Головна навігація" },
  auth: {
    signIn: "Увійти",
    signOut: "Вийти",
    continueWithTelegram: "Продовжити через Telegram",
    loginTitle: "Вхід до YWS Lab",
    loginHint: "Увійдіть через свій акаунт Telegram. Ми не просимо пароль — підтвердження приходить у Telegram.",
    errors: {
      cancelled: "Вхід скасовано. Спробуйте ще раз, коли будете готові.",
      state: "Сесія входу застаріла або недійсна. Спробуйте ще раз.",
      provider: "Telegram зараз не відповідає. Спробуйте ще раз за хвилину.",
      token: "Не вдалося підтвердити вхід у Telegram. Спробуйте ще раз.",
      disabled: "Цей обліковий запис вимкнено. Зверніться до адміністратора школи.",
      config: "Вхід через Telegram ще не налаштовано на сервері.",
    },
    retry: "Спробувати ще раз",
    accountMenu: "Обліковий запис",
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
