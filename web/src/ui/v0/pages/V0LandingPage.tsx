import { Link } from "react-router-dom";
import { Gamepad2, TrendingUp, Trophy, Users, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dict, useI18n } from "@/lib/i18n";

const TR = {
  "features.organize.title": { ru: "Организовывайте игры", en: "Organize games" },
  "features.organize.desc": { ru: "Создавайте и управляйте играми в падел с друзьями", en: "Create and manage padel games with friends" },
  "features.rating.title": { ru: "Отслеживайте рейтинг", en: "Track your rating" },
  "features.rating.desc": { ru: "Следите за своим прогрессом в деталях", en: "Follow your progress in detail" },
  "features.partners.title": { ru: "Найдите партнёров", en: "Find partners" },
  "features.partners.desc": { ru: "Познакомьтесь с другими игроками", en: "Meet other players" },
  "features.compete.title": { ru: "Соревнуйтесь", en: "Compete" },
  "features.compete.desc": { ru: "Достигайте вершин рейтинга", en: "Climb to the top of the rating" },
  "hero.titleStart": { ru: "Играй в", en: "Play" },
  "hero.titleAccent": { ru: "падел.", en: "padel." },
  "hero.titleEnd": { ru: "Расти в рейтинге.", en: "Grow your rating." },
  "hero.subtitle": {
    ru: "Организуй игры, отслеживай рейтинг и найди партнёров для игры.",
    en: "Organize games, track your rating and find partners to play with.",
  },
  "cta.login": { ru: "Войти", en: "Sign in" },
  "cta.register": { ru: "Создать аккаунт", en: "Create account" },
} satisfies Dict;

export function V0LandingPage() {
  const { t } = useI18n(TR);
  const features = [
    {
      icon: Gamepad2,
      title: t("features.organize.title"),
      description: t("features.organize.desc"),
    },
    {
      icon: TrendingUp,
      title: t("features.rating.title"),
      description: t("features.rating.desc"),
    },
    {
      icon: Users,
      title: t("features.partners.title"),
      description: t("features.partners.desc"),
    },
    {
      icon: Trophy,
      title: t("features.compete.title"),
      description: t("features.compete.desc"),
    },
  ];

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center px-4 py-8">
      <div className="flex flex-1 w-full max-w-2xl items-center justify-center">
       <div className="w-full space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <Badge className="mb-4 bg-primary/20 text-primary border-primary/30 border inline-flex">
            <Zap className="mr-1 h-3 w-3" />
            padix
          </Badge>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            {t("hero.titleStart")} <span className="text-primary">{t("hero.titleAccent")}</span> {t("hero.titleEnd")}
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            {t("hero.subtitle")}
          </p>
        </div>

        {/* Features Grid - Compact */}
        <div className="grid grid-cols-2 gap-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex gap-3 items-start">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Buttons - Primary Focus */}
        <div className="flex gap-4 items-center justify-center pt-6">
          <Button asChild size="lg" className="h-11 min-w-[160px]">
            <Link to="/login" className="justify-center">
              {t("cta.login")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 min-w-[160px]">
            <Link to="/register" className="justify-center">
              {t("cta.register")}
            </Link>
          </Button>
        </div>
       </div>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        <span aria-hidden>·</span>
        <Link to="/terms" className="hover:text-foreground transition-colors">
          Terms &amp; Conditions
        </Link>
      </footer>
    </div>
  );
}
