import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { api, AuthConfig, MeResponse, TelegramAuthPayload } from "@/lib/api";
import { GoogleLoginButton } from "@/components/google-login-button";
import { FacebookLoginButton } from "@/components/facebook-login-button";
import { TelegramLoginButton } from "@/components/telegram-login-button";

type Provider = "telegram" | "google" | "facebook" | "twitter";

const PROVIDER_LABELS: Record<Provider, string> = {
  telegram: "Telegram",
  google: "Google",
  facebook: "Facebook",
  twitter: "X (Twitter)",
};

/**
 * Секция «Связанные аккаунты» в /settings. Показывает все включённые на сервере OAuth-провайдеры
 * с возможностью привязать/отвязать.
 *
 * Отвязка проверяется на бэке — нельзя отвязать единственный способ входа.
 */
export function ConnectedAccountsSection(props: {
  me: MeResponse;
  onMeUpdate: (me: MeResponse) => void;
}) {
  const confirm = useConfirm();
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLinkUi, setOpenLinkUi] = useState<Provider | null>(null);

  useEffect(() => {
    api.authConfig().then(setAuthConfig).catch(() => setAuthConfig(null));
  }, []);

  const isLinked: Record<Provider, boolean> = {
    telegram: props.me.authProviders?.telegram ?? false,
    google: props.me.authProviders?.google ?? false,
    facebook: props.me.authProviders?.facebook ?? false,
    twitter: props.me.authProviders?.twitter ?? false,
  };
  const available: Record<Provider, boolean> = {
    telegram: !!authConfig?.telegramBotUsername,
    google: !!authConfig?.googleClientId,
    facebook: !!authConfig?.facebookAppId,
    twitter: !!authConfig?.twitterClientId,
  };

  async function handleUnlink(provider: Provider) {
    const ok = await confirm({
      title: `Отвязать ${PROVIDER_LABELS[provider]}?`,
      description: "Вход через этот провайдер перестанет работать. Привязку можно вернуть позже.",
      confirmLabel: "Отвязать",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    setActiveProvider(provider);
    setError(null);
    try {
      const updated = await api.unlinkProvider(provider);
      props.onMeUpdate(updated);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось отвязать");
    } finally {
      setActiveProvider(null);
    }
  }

  async function handleLinkGoogle(idToken: string) {
    setActiveProvider("google");
    setError(null);
    try {
      const updated = await api.linkGoogle(idToken);
      props.onMeUpdate(updated);
      setOpenLinkUi(null);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось привязать Google");
    } finally {
      setActiveProvider(null);
    }
  }

  async function handleLinkFacebook(accessToken: string) {
    setActiveProvider("facebook");
    setError(null);
    try {
      const updated = await api.linkFacebook(accessToken);
      props.onMeUpdate(updated);
      setOpenLinkUi(null);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось привязать Facebook");
    } finally {
      setActiveProvider(null);
    }
  }

  async function handleLinkTelegram(payload: TelegramAuthPayload) {
    setActiveProvider("telegram");
    setError(null);
    try {
      const updated = await api.linkTelegram(payload);
      props.onMeUpdate(updated);
      setOpenLinkUi(null);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось привязать Telegram");
    } finally {
      setActiveProvider(null);
    }
  }

  async function handleLinkTwitter() {
    setActiveProvider("twitter");
    setError(null);
    try {
      const { url } = await api.linkTwitterStart();
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message ?? "Не удалось начать привязку X");
      setActiveProvider(null);
    }
  }

  // Если ни одного провайдера не настроено на сервере — секцию не показываем.
  const anyAvailable = Object.values(available).some(Boolean);
  if (!authConfig || !anyAvailable) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Связанные аккаунты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        ) : null}

        {(["google", "telegram", "facebook", "twitter"] as Provider[]).map((p) => {
          if (!available[p]) return null;
          const linked = isLinked[p];
          const busy = activeProvider === p;
          return (
            <div key={p}>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <ProviderIcon provider={p} />
                  <span className="font-medium">{PROVIDER_LABELS[p]}</span>
                  {linked ? (
                    <span className="ml-2 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Привязан
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">Не привязан</span>
                  )}
                </div>
                <div>
                  {linked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlink(p)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отвязать"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (p === "twitter") handleLinkTwitter();
                        else setOpenLinkUi(p);
                      }}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Привязать"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline UI с кнопкой провайдера — раскрывается при нажатии «Привязать». */}
              {openLinkUi === p && !linked ? (
                <div className="mt-2 flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-3">
                  {p === "google" && authConfig.googleClientId ? (
                    <GoogleLoginButton
                      clientId={authConfig.googleClientId}
                      onAuth={handleLinkGoogle}
                      text="continue_with"
                      size="large"
                    />
                  ) : null}
                  {p === "facebook" && authConfig.facebookAppId ? (
                    <FacebookLoginButton
                      appId={authConfig.facebookAppId}
                      onAuth={handleLinkFacebook}
                      text="Подключить Facebook"
                    />
                  ) : null}
                  {p === "telegram" && authConfig.telegramBotUsername ? (
                    <TelegramLoginButton
                      botUsername={authConfig.telegramBotUsername}
                      onAuth={handleLinkTelegram}
                      size="large"
                    />
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setOpenLinkUi(null)}
                  >
                    Отмена
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  switch (provider) {
    case "google":
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path fill="#EA4335" d="M12 5.1c1.7 0 3.3.6 4.5 1.7l3.3-3.3C17.7 1.5 15 .5 12 .5 7.4.5 3.4 3.1 1.4 6.9l3.8 3C6.2 7.1 8.9 5.1 12 5.1z" />
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.6z" />
          <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.3-1.5-.3-2.3s.1-1.6.3-2.3l-3.8-3C.5 8.4 0 10.1 0 12s.5 3.6 1.4 5.3l3.8-3z" />
          <path fill="#34A853" d="M12 23.5c3 0 5.5-1 7.3-2.7l-3.7-2.9c-1 .7-2.3 1.1-3.6 1.1-3.1 0-5.8-2-6.8-4.8L1.4 17.1c2 3.8 6 6.4 10.6 6.4z" />
        </svg>
      );
    case "facebook":
      return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>;
    case "twitter":
      return <svg className="h-4 w-4" viewBox="0 0 1200 1227" fill="currentColor"><path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026Z" /></svg>;
    case "telegram":
      return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#229ED9"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>;
  }
}
