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
      themePapaya: 'Papaya',
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
