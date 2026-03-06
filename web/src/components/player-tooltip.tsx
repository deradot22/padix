"use client";

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  avatarUrl?: string | null;
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

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const TOOLTIP_WIDTH = 220;
  const PADDING = 8;

  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = rect.left + rect.width / 2;
    const halfW = TOOLTIP_WIDTH / 2;
    if (left - halfW < PADDING) left = halfW + PADDING;
    if (left + halfW > vw - PADDING) left = vw - halfW - PADDING;

    setPos({
      top: rect.top,
      left,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

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

      {open && pos ? createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999]"
          style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}
          data-player-tooltip
        >
          <div className="mb-2 p-3 min-w-[180px] max-w-[220px] rounded-lg bg-card border border-border shadow-xl">
            <div className="mb-3 flex items-center gap-3">
              {player.avatarUrl ? (
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border">
                  <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-sm font-semibold border border-border">
                  {player.name?.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"}
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">{player.name}</p>
                {publicId ? <p className="text-xs text-muted-foreground">{publicId}</p> : null}
              </div>
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
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

