import { Outlet } from "react-router-dom";
import { V0Header } from "./V0Header";
import { cn } from "./utils";

export function V0Layout(props: {
  authed: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  notificationCount?: number;
  onLogout?: () => void;
}) {
  return (
    <div className={cn("v0 min-h-screen bg-background text-foreground", props.theme === "dark" && "dark")}>
      <V0Header
        authed={props.authed}
        theme={props.theme}
        onToggleTheme={props.onToggleTheme}
        notificationCount={props.notificationCount}
        onLogout={props.onLogout}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

