import { useLocation, useNavigate } from "react-router-dom";
import Link from "@/components/ui/AppLink";
import { KlawvaMark } from "../icons/KlawvaMark";
import { Button } from "../ui/Button";
import { clearStudioSession, useStudioSession } from "@/lib/studio-session";
import { LayoutList, ShieldCheck, LogOut } from "lucide-react";

export function StudioNavbar() {
  const session = useStudioSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 text-sm transition-colors ${
      active ? "text-klawva-accent" : "text-klawva-muted hover:text-klawva-text"
    }`;

  const handleLogout = () => {
    clearStudioSession();
    navigate("/studio/login");
  };

  return (
    <nav className="fixed top-0 left-0 w-full h-16 z-50 bg-klawva-bg/85 backdrop-blur-md border-b border-klawva-border">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/studio" className="flex items-center gap-3">
            <KlawvaMark size={28} />
            <span className="font-syne font-bold text-klawva-accent tracking-widest text-lg">
              KLAWVA STUDIO
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/studio" className={linkClass(pathname === "/studio")}>
              <LayoutList size={16} />
              <span>Listings</span>
            </Link>
            {session?.admin && (
              <Link href="/studio/cockpit" className={linkClass(pathname === "/studio/cockpit")}>
                <ShieldCheck size={16} />
                <span>Cockpit</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-xs font-mono text-klawva-muted border-r border-klawva-border pr-4">
            {session?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut size={14} />
            <span>Logout</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
