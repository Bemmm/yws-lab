'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Builder i18n seam. The builder core (builder-client / preview-client) reads
 * its strings from this context instead of Papaya's app-wide `useT()`, so the
 * exact same components can be bundled into the standalone builder app
 * (apps/builder) without dragging in Papaya's i18n.
 *
 * Shape mirrors the slices the builder actually uses: `workoutBuilder.*` and the
 * one `sidebar.teacher.workouts` label — so call sites stay `t.workoutBuilder.X`.
 *
 * - Papaya (apps/web) provides `{ workoutBuilder: t.workoutBuilder, sidebar: … }`
 *   from app-i18n (the cabinet's localised dict).
 * - Standalone (apps/builder) provides DEFAULT_BUILDER_STRINGS (RU).
 */

export const DEFAULT_BUILDER_STRINGS = {
  workoutBuilder: {
    paint: {
      label: 'раскрасить:',
      hintAction: 'кликни или тяни по асанам',
      done: 'Готово',
      removeColor: 'Снять цвет',
      colors: {
        amber: 'Жёлтый',
        emerald: 'Зелёный',
        orange: 'Оранжевый',
        sky: 'Синий',
        violet: 'Фиолетовый',
        rose: 'Розовый',
      },
    },
    program: {
      eyebrow: 'программа',
      titlePlaceholder: 'Название программы',
      descriptionPlaceholder: 'Описание программы — общий план: дыхание, разминка, последовательность сетов…',
      clear: 'Очистить',
      addSession: '+ Сет',
      preview: 'Превью',
      share: {
        button: 'Поделиться',
        hint: 'Ссылка для учеников — открывается без входа',
        copy: 'Копировать',
        copied: 'Скопировано',
        stop: 'Остановить доступ',
      },
    },
    preview: {
      back: 'К конструктору',
      title: 'Превью программы',
      theme: 'Тема',
      themeYws: 'YWS Original',
      themePapaya: 'YWS Lab',
      print: 'Печать',
      download: 'Скачать PDF',
      empty: 'Программа пуста — добавьте асаны в конструкторе.',
    },
    session: {
      removeTitle: 'Удалить сет',
      dragHandle: 'Перетащить — изменить порядок',
      confirmShrink: 'Последний слот заполнен — асана будет удалена. Продолжить?',
      descriptionPlaceholder: 'Описание сета — например, сколько раз повторить и паузы между кругами…',
    },
    slotsCounter: {
      remove: 'Убрать слот',
      add: 'Добавить слот',
    },
    slot: {
      clear: 'Убрать асану',
      emptyLabel: '(пустой слот)',
      sideGroupLabel: 'Сторона',
      sideLeft: 'Левая сторона',
      sideBoth: 'Без стороны',
      sideRight: 'Правая сторона',
    },
    segments: {
      addBreath: '+ дыхание',
      paintTitle: 'Раскрасить',
      setBreathTitle: 'Задать количество дыханий',
      popoverEyebrowPrefix: 'дыхания · до',
      removeSegment: 'Удалить сегмент',
      addSegment: '+ Сегмент',
      clear: 'Очистить',
      done: 'Готово',
      countLabel: 'Количество дыханий',
      typeStatic: 'Статика',
      typeDynamic: 'Динамика',
      popoverAriaPrefix: 'Дыхания',
    },
    library: {
      eyebrow: 'библиотека',
      title: 'Асаны',
      all: 'Все',
      other: 'Другое',
      searchPlaceholder: 'Поиск…',
      showMorePrefix: 'Показать ещё',
      notFound: 'Ничего не найдено',
      itemHint: 'клик или drag',
    },
    schedule: {
      toggle: 'Расписание',
      show: 'Показать расписание',
      hide: 'Скрыть расписание',
      title: 'Расписание',
      caption: 'Отметьте дни, в которые выполнять каждый сет.',
      setPrefix: 'С',
      dayPrefix: 'Д',
      addRow: '+ Активность',
      rowPlaceholder: 'Активность',
      removeRow: 'Удалить строку',
      addDay: 'Добавить день',
      removeDay: 'Убрать день',
      emptyRows: 'Добавьте сеты — строки расписания появятся автоматически.',
      eraser: 'Стереть',
    },
    empty: {
      body: 'Перетаскивай асаны из библиотеки справа в слоты сессии. Каждая сессия — 6 слотов.',
      backToList: '← К списку программ',
    },
  },
  sidebar: { teacher: { workouts: 'Тренировки' } },
}

export type BuilderStrings = typeof DEFAULT_BUILDER_STRINGS

export const UK_BUILDER_STRINGS: BuilderStrings = {
  workoutBuilder: {
    paint:{label:'розфарбувати:',hintAction:'клікни або тягни по асанах',done:'Готово',removeColor:'Прибрати колір',colors:{amber:'Жовтий',emerald:'Зелений',orange:'Помаранчевий',sky:'Синій',violet:'Фіолетовий',rose:'Рожевий'}},
    program:{eyebrow:'програма',titlePlaceholder:'Назва програми',descriptionPlaceholder:'Опис програми — загальний план: дихання, розминка, послідовність сетів…',clear:'Очистити',addSession:'+ Сет',preview:'Прев’ю',share:{button:'Поділитися',hint:'Посилання для учнів — відкривається без входу',copy:'Копіювати',copied:'Скопійовано',stop:'Зупинити доступ'}},
    preview:{back:'До конструктора',title:'Прев’ю програми',theme:'Тема',themeYws:'YWS Original',themePapaya:'YWS Lab',print:'Друк',download:'Завантажити PDF',empty:'Програма порожня — додайте асани в конструкторі.'},
    session:{removeTitle:'Видалити сет',dragHandle:'Перетягнути — змінити порядок',confirmShrink:'Останній слот заповнений — асана буде видалена. Продовжити?',descriptionPlaceholder:'Опис сету — наприклад, скільки разів повторити та паузи між колами…'},
    slotsCounter:{remove:'Прибрати слот',add:'Додати слот'},
    slot:{clear:'Прибрати асану',emptyLabel:'(порожній слот)',sideGroupLabel:'Сторона',sideLeft:'Ліва сторона',sideBoth:'Без сторони',sideRight:'Права сторона'},
    segments:{addBreath:'+ дихання',paintTitle:'Розфарбувати',setBreathTitle:'Задати кількість дихань',popoverEyebrowPrefix:'дихання · до',removeSegment:'Видалити сегмент',addSegment:'+ Сегмент',clear:'Очистити',done:'Готово',countLabel:'Кількість дихань',typeStatic:'Статика',typeDynamic:'Динаміка',popoverAriaPrefix:'Дихання'},
    library:{eyebrow:'бібліотека',title:'Асани',all:'Усі',other:'Інше',searchPlaceholder:'Пошук…',showMorePrefix:'Показати ще',notFound:'Нічого не знайдено',itemHint:'клік або drag'},
    schedule:{toggle:'Розклад',show:'Показати розклад',hide:'Сховати розклад',title:'Розклад',caption:'Позначте дні, у які виконувати кожен сет.',setPrefix:'С',dayPrefix:'Д',addRow:'+ Активність',rowPlaceholder:'Активність',removeRow:'Видалити рядок',addDay:'Додати день',removeDay:'Прибрати день',emptyRows:'Додайте сети — рядки розкладу з’являться автоматично.',eraser:'Стерти'},
    empty:{body:'Перетягуй асани з бібліотеки праворуч у слоти сесії. Кожна сесія — 6 слотів.',backToList:'← До списку програм'},
  }, sidebar:{teacher:{workouts:'Тренування'}}
}

const StringsContext = createContext<BuilderStrings>(DEFAULT_BUILDER_STRINGS)

export function BuilderStringsProvider({
  value,
  children,
}: {
  value: BuilderStrings
  children: ReactNode
}) {
  return <StringsContext.Provider value={value}>{children}</StringsContext.Provider>
}

/** Builder-scoped strings — same shape as `t` so call sites stay `t.workoutBuilder.X`. */
export function useStrings(): BuilderStrings {
  return useContext(StringsContext)
}
