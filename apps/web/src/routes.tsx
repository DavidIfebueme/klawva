import {
  createBrowserRouter,
  isRouteErrorResponse,
  Outlet,
  redirect,
  useRouteError,
} from "react-router-dom";
import CustomRequest from "./app/custom-request/page.tsx";
import Privacy from "./app/privacy/page.tsx";
import Terms from "./app/terms/page.tsx";
import NotFound from "./app/not-found.tsx";
import StudioLayout from "./app/studio/layout.tsx";
import { clearStudioSession } from "./lib/studio-session.ts";
import { loadDisplay } from "./lib/display.ts";

function errorDetail(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong";
}

function RootRouteError() {
  const error = useRouteError();
  return (
    <div className="min-h-screen flex items-center justify-center bg-klawva-bg px-4 font-mono">
      <div className="max-w-md w-full bg-klawva-surface border border-klawva-border p-8 rounded-lg text-center">
        <h1 className="font-syne font-bold text-xl uppercase text-white mb-2">
          Something went wrong
        </h1>
        <p className="text-xs text-klawva-muted mb-6 break-words">
          {errorDetail(error)}
        </p>
        <a
          href="/"
          className="text-xs text-klawva-accent uppercase tracking-wider font-syne font-bold"
        >
          Back to Klawva
        </a>
      </div>
    </div>
  );
}

function StudioRouteError() {
  const error = useRouteError();
  return (
    <div className="min-h-screen flex items-center justify-center bg-klawva-bg px-4 font-mono">
      <div className="max-w-md w-full bg-klawva-surface border border-klawva-border p-8 rounded-lg text-center">
        <h1 className="font-syne font-bold text-xl uppercase text-white mb-2">
          Studio Error
        </h1>
        <p className="text-xs text-klawva-muted mb-6 break-words">
          {errorDetail(error)}
        </p>
        <button
          onClick={() => {
            clearStudioSession();
            window.location.assign("/studio/login");
          }}
          className="text-xs text-klawva-accent uppercase tracking-wider font-syne font-bold"
        >
          Clear session and return to login
        </button>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    id: "root",
    loader: ({ request }: { request: Request }) =>
      loadDisplay(new URL(request.url).searchParams.get("country")),
    shouldRevalidate: () => false,
    element: <Outlet />,
    errorElement: <RootRouteError />,
    children: [
      { path: "/", lazy: () => import("./app/page.tsx") },
      { path: "/employees", lazy: () => import("./app/employees/page.tsx") },
      {
        path: "/employees/launch",
        lazy: () => import("./app/employees/launch/page.tsx"),
      },
      {
        path: "/employees/launch/:session/:token",
        lazy: () => import("./app/employees/launch/page.tsx"),
      },
      {
        path: "/chat/:sessionId",
        lazy: () => import("./app/chat/[sessionId]/page.tsx"),
      },
      { path: "/employees/:agent", lazy: () => import("./app/hire/[agent]/page.tsx") },
      {
        path: "/hire/:agent",
        loader: ({ params }: { params: { agent?: string } }) =>
          redirect(`/employees/${params.agent ?? ""}`),
      },
      { path: "/checkout", lazy: () => import("./app/checkout/page.tsx") },
      { path: "/download", lazy: () => import("./app/download/page.tsx") },
      { path: "/pair", lazy: () => import("./app/pair/page.tsx") },
      { path: "/store", loader: () => redirect("/employees") },
      { path: "/agents", loader: () => redirect("/employees") },
      { path: "/custom-request", element: <CustomRequest /> },
      { path: "/publish", lazy: () => import("./app/publish/page.tsx") },
      { path: "/pricing", lazy: () => import("./app/pricing/page.tsx") },
      { path: "/privacy", element: <Privacy /> },
      { path: "/terms", element: <Terms /> },
      {
        path: "/report/:sessionId",
        lazy: () => import("./app/report/[sessionId]/page.tsx"),
      },
      { path: "/account", lazy: () => import("./app/account/page.tsx") },
      {
        path: "/account/sessions/:id",
        lazy: () => import("./app/account/sessions/[id]/page.tsx"),
      },
      {
        path: "/studio",
        element: <StudioLayout />,
        errorElement: <StudioRouteError />,
        children: [
          { index: true, lazy: () => import("./app/studio/page.tsx") },
          { path: "login", lazy: () => import("./app/studio/login/page.tsx") },
          {
            path: "auth/verify",
            lazy: () => import("./app/studio/auth/verify/page.tsx"),
          },
          {
            path: "listings/:id",
            lazy: () => import("./app/studio/listings/[id]/page.tsx"),
          },
          { path: "cockpit", lazy: () => import("./app/studio/cockpit/page.tsx") },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
