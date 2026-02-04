export function ntrpLevel(rating: number): string {
  // Shift NTRP down by 1.0 from previous scale
  if (rating < 800) return "1.0";
  if (rating < 900) return "1.5";
  if (rating < 1000) return "2.0";
  if (rating < 1100) return "2.5";
  if (rating < 1200) return "3.0";
  if (rating < 1300) return "3.5";
  if (rating < 1400) return "4.0";
  if (rating < 1500) return "4.5";
  return "5.0+";
}
