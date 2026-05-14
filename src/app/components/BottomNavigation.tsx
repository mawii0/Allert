import { NavLink } from "react-router";
import { Home, Activity, Stethoscope, Settings } from "lucide-react";

export function BottomNavigation() {
  const navItems = [
    { path: "/app/dashboard", icon: Home, label: "Home" },
    { path: "/app/environmental", icon: Activity, label: "Environment" },
    { path: "/app/clinical", icon: Stethoscope, label: "Clinical" },
    { path: "/app/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800 max-w-md mx-auto">
      <div className="grid grid-cols-4 h-20">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive ? "text-emerald-400" : "text-zinc-400"
              }`
            }
          >
            <item.icon className="w-6 h-6" />
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
