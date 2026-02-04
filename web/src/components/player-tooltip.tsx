"use client";

import { ReactNode } from "react";
import { Gamepad2, Trophy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  onAddFriend?: (playerId: number | string) => void;
}

export function PlayerTooltip({ player, children, showAddFriend = true, onAddFriend }: PlayerTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="p-0 bg-card border-border shadow-xl" sideOffset={8}>
          <div className="p-3 min-w-[180px]">
            <div className="mb-3">
              <p className="font-semibold text-foreground">{player.name}</p>
              {player.odid ? <p className="text-xs text-muted-foreground">{player.odid}</p> : null}
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
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-3 h-8 text-xs bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFriend?.(player.id);
                }}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                В друзья
              </Button>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

