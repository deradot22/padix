import { AnimationEntry } from "./types";
import { ClassicAnimation } from "./classic";
import { CounterAnimation } from "./counter";
import { ConfettiAnimation } from "./confetti";
import { SlotMachineAnimation } from "./slot-machine";
import { ProgressRingAnimation } from "./progress-ring";
import { DynamicIslandAnimation } from "./dynamic-island";
import { SparklineAnimation } from "./sparkline";

/**
 * Реестр всех анимаций. Добавь сюда новый вариант — он появится в селекторе.
 */
export const ANIMATIONS: AnimationEntry[] = [
  {
    id: "classic",
    title: "Classic — модал с теннисными шариками",
    description: "Текущая прод-версия: большой центральный модал, дождь 🎾, плашка ±N",
    component: ClassicAnimation,
  },
  {
    id: "counter",
    title: "Counter — отсчёт цифр",
    description: "Минимализм: цифра «отсчитывается» от старого к новому, цветной градиент",
    component: CounterAnimation,
  },
  {
    id: "confetti",
    title: "Confetti — тост снизу + конфетти",
    description: "Лёгкий вариант — не блокирует экран, тост снизу с цветным дождём",
    component: ConfettiAnimation,
  },
  {
    id: "slot-machine",
    title: "Slot Machine — барабаны как Apple Pay",
    description: "Каждая цифра на своём reel, барабаны останавливаются по очереди слева-направо с pop-эффектом",
    component: SlotMachineAnimation,
  },
  {
    id: "progress-ring",
    title: "Progress Ring — кольцо как Apple Watch",
    description: "Большая цифра в центре, кольцо градиента заполняется снизу по часовой за 1.2с",
    component: ProgressRingAnimation,
  },
  {
    id: "dynamic-island",
    title: "Dynamic Island — pill сверху (iOS 17)",
    description: "Узкая капсула появляется → раскрывается с было/стало → схлопывается. Ненавязчиво.",
    component: DynamicIslandAnimation,
  },
  {
    id: "sparkline",
    title: "Sparkline — мини-график (Robinhood / Stocks)",
    description: "График последних 10 матчей с пульсирующей последней точкой. Самый «информативный» вариант — даёт контекст",
    component: SparklineAnimation,
  },
];
