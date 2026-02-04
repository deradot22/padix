"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Check, Gamepad2, Trophy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ntrpLevel } from "@/lib/rating";

export interface PlayerTooltipPlayer {
  id: number | string;
  name: string;
  odid?: string;
  rating: number;
  matches?: number;
  ntrp?: string;
}

export interface PlayerTooltipProps {
  player: PlayerTooltipPlayer;
  children: ReactNode;
  showAddFriend?: boolean;
  addFriendStatus?: "none" | "requested" | "friend";
  onAddFriend?: (playerId: number | string) => Promise<string | void> | string | void;
}

function formatPublicId(odid?: string) {
  if (!odid) return null;
  const trimmed = odid.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function PlayerTooltip({
  player,
  children,
  showAddFriend = true,
  addFriendStatus = "none",
  onAddFriend,
}: PlayerTooltipProps) {
  const publicId = formatPublicId(player.odid);
  const [open, setOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-player-tooltip]")) return;
      setOpen(false);
    };
    const onDocKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open]);

  useEffect(() => {
    const onAnyOpen = (event: Event) => {
      const custom = event as CustomEvent<{ id: string }>;
      if (custom.detail?.id && custom.detail.id !== tooltipId) {
        setOpen(false);
      }
    };
    window.addEventListener("player-tooltip-open", onAnyOpen as EventListener);
    return () => window.removeEventListener("player-tooltip-open", onAnyOpen as EventListener);
  }, [tooltipId]);

  return (
    <div ref={containerRef} className="relative block w-full" data-player-tooltip>
      <span
        role="button"
        tabIndex={0}
        className="inline-flex w-full"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => {
            const next = !prev;
            if (next) {
              setActionMsg(null);
              window.dispatchEvent(new CustomEvent("player-tooltip-open", { detail: { id: tooltipId } }));
            }
            return next;
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => {
              const next = !prev;
              if (next) {
                setActionMsg(null);
                window.dispatchEvent(new CustomEvent("player-tooltip-open", { detail: { id: tooltipId } }));
              }
              return next;
            });
          }
        }}
      >
        {children}
      </span>

      {open ? (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50">
          <div className="p-3 min-w-[180px] rounded-lg bg-card border border-border shadow-xl">
            <div className="mb-3">
              <p className="font-semibold text-foreground">{player.name}</p>
              {publicId ? <p className="text-xs text-muted-foreground">{publicId}</p> : null}
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Trophy className="h-3.5 w-3.5" />
                  Рейтинг
                </span>
                <span className="font-medium text-foreground">{player.rating}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">NTRP</span>
                <span className="font-medium text-foreground">
                  {player.ntrp || ntrpLevel(player.rating)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Gamepad2 className="h-3.5 w-3.5" />
                  Матчей
                </span>
                <span className="font-medium text-foreground">{player.matches ?? 0}</span>
              </div>
            </div>

            {showAddFriend ? (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="h-8 w-8 bg-transparent"
                  aria-label={addFriendStatus === "friend" ? "В друзьях" : addFriendStatus === "requested" ? "Заявка отправлена" : "Добавить в друзья"}
                  disabled={addFriendStatus !== "none"}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (addFriendStatus !== "none") return;
                    if (!onAddFriend) return;
                    setActionMsg(null);
                    try {
                      const result = await onAddFriend(player.id);
                      if (typeof result === "string") setActionMsg(result);
                    } catch (err: any) {
                      const raw = err?.message ?? "Ошибка";
                      const lower = String(raw).toLowerCase();
                      if (lower.includes("already") || lower.includes("sent request")) {
                        setActionMsg("Заявка уже отправлена");
                      } else {
                        setActionMsg(raw);
                      }
                    }
                  }}
                >
                  {addFriendStatus === "none" ? <UserPlus className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                {addFriendStatus === "requested" ? (
                  <div className="text-xs text-muted-foreground">Заявка отправлена</div>
                ) : addFriendStatus === "friend" ? (
                  <div className="text-xs text-muted-foreground">В друзьях</div>
                ) : actionMsg ? (
                  <div className="text-xs text-muted-foreground">{actionMsg}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

