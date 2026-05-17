/**
 * Контракт для всех анимаций изменения рейтинга.
 *
 * Анимация рендерится внутри preview-окна (mobile ИЛИ desktop).
 * `viewport` подсказывает контексту в каком формате рендериться (не обязательно использовать).
 *
 * Чтобы добавить новую анимацию:
 *   1. Создай файл src/animations/my-anim.tsx с компонентом, реализующим RatingAnimationProps.
 *   2. Зарегистрируй его в src/animations/registry.ts.
 */
export interface RatingAnimationProps {
  /** Предыдущий рейтинг. */
  previousRating: number;
  /** Новый рейтинг. */
  newRating: number;
  /** delta = newRating - previousRating. Может быть 0 / +N / -N. */
  delta: number;
  /** "mobile" — узкое окно (~390px), "desktop" — широкое. */
  viewport: "mobile" | "desktop";
  /** Уникальный key, изменяется при каждом «Replay» — используй как trigger для перезапуска анимации. */
  playKey: number;
  /** Вызывается когда пользователь нажал «закрыть» во встроенной кнопке. */
  onClose?: () => void;
}

export interface AnimationEntry {
  /** Уникальный id, появляется в селекторе. */
  id: string;
  /** Отображаемое название. */
  title: string;
  /** Короткое описание под названием. */
  description?: string;
  /** Сам компонент. */
  component: React.ComponentType<RatingAnimationProps>;
}
