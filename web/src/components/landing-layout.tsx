import React from "react";

export function LandingLayout(props: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {props.children}
    </div>
  );
}
