import React from "react";
import { Header } from "@/components/header";

export function MainLayout(props: {
  children: React.ReactNode;
  authed: boolean;
  notificationCount: number;
  onRefreshNotifications: () => void | Promise<void>;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header
        authed={props.authed}
        notificationCount={props.notificationCount}
        onRefreshNotifications={props.onRefreshNotifications}
        onLogout={props.onLogout}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{props.children}</main>
    </div>
  );
}

