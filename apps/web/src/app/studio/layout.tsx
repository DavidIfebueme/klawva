import { Outlet, useLocation } from "react-router-dom";
import { StudioAuthProvider } from "@/components/studio-auth-provider";
import { StudioNavbar } from "@/components/layout/StudioNavbar";

export default function StudioLayout() {
  const { pathname } = useLocation();
  const isAuthPage = pathname === "/studio/login" || pathname === "/studio/auth/verify";

  return (
    <StudioAuthProvider>
      <div className="min-h-screen bg-klawva-bg flex flex-col font-mono text-klawva-text">
        {!isAuthPage && <StudioNavbar />}
        <main
          className={`flex-grow w-full max-w-7xl mx-auto px-6 ${
            isAuthPage ? "" : "pt-24 pb-12"
          }`}
        >
          <Outlet />
        </main>
      </div>
    </StudioAuthProvider>
  );
}
