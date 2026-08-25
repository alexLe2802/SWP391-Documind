"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

// Hiển thị giao diện reveal.
export function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const delayMs = Math.min(Math.max(delay, 0), 360);

  useEffect(() => {
    const element = elementRef.current;

    if (!element) {
      return;
    }

    setIsReady(true);

    if (!("IntersectionObserver" in window)) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        setIsRevealed(true);
        observer.disconnect();
      },
      { threshold: 0.12 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const classes = [
    "reveal",
    className,
    isReady ? "is-reveal-ready" : "",
    isRevealed ? "is-revealed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = { "--reveal-delay": `${delayMs}ms` } as CSSProperties;

  return (
    <div ref={elementRef} className={classes} style={style}>
      {children}
    </div>
  );
}
