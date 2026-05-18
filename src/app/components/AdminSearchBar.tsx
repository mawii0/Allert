import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

interface AdminSearchBarProps {
  className?: string;
  placeholder?: string;
}

export function AdminSearchBar({
  className = "",
  placeholder = "Search nodes, alerts, metrics...",
}: AdminSearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`relative ${className}`.trim()}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
      <input
        ref={inputRef}
        type="search"
        placeholder={`${placeholder} (/ to focus)`}
        className="w-full rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-10 py-2 text-sm text-white placeholder:text-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#00bfa5]/60"
      />
    </div>
  );
}
