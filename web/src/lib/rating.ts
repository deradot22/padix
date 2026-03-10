export function ntrpLevel(rating: number): string {
  if (rating < 900) return "1.0";
  if (rating < 1000) return "1.5";
  if (rating < 1100) return "2.0";
  if (rating < 1200) return "2.5";
  if (rating < 1500) return "3.0";
  if (rating < 1700) return "3.5";
  if (rating < 1900) return "4.0";
  if (rating < 2100) return "4.5";
  return "5.0+";
}
