export function ntrpLevel(rating: number): string {
  if (rating < 610) return "1.0";
  if (rating < 870) return "1.5";
  if (rating < 1130) return "2.0";
  if (rating < 1350) return "2.5";
  if (rating < 1650) return "3.0";
  if (rating < 1900) return "3.5";
  if (rating < 2150) return "4.0";
  if (rating < 2400) return "4.5";
  return "5.0+";
}
