import { forwardRef, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ModalScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ModalScrollArea = forwardRef<HTMLDivElement, ModalScrollAreaProps>(
  ({ className, children, style, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [thumb, setThumb] = useState<{ top: number; height: number }>({ top: 0, height: 0 });

    const setRefs = (el: HTMLDivElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    };

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const update = () => {
        const { scrollTop, scrollHeight, clientHeight } = el;
        if (scrollHeight <= clientHeight) { setThumb({ top: 0, height: 0 }); return; }
        const thumbH = Math.max(32, (clientHeight / scrollHeight) * clientHeight);
        const thumbT = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - thumbH);
        setThumb({ top: thumbT, height: thumbH });
      };
      update();
      el.addEventListener("scroll", update, { passive: true });
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
    }, []);

    return (
      <div className="relative">
        <div
          ref={setRefs}
          className={cn(className)}
          style={{ scrollbarWidth: "none", ...style }}
          {...props}
        >
          {children}
        </div>
        {thumb.height > 0 && (
          <div className="pointer-events-none absolute right-0.5 top-0 bottom-0 w-1.5">
            <div
              className="absolute w-full rounded-full"
              style={{
                top: thumb.top,
                height: thumb.height,
                background: "color-mix(in oklch, var(--primary) 40%, transparent)",
              }}
            />
          </div>
        )}
      </div>
    );
  }
);
ModalScrollArea.displayName = "ModalScrollArea";
