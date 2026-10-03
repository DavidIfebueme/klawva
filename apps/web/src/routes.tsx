import { createBrowserRouter } from "react-router-dom";
import Landing from "./app/page.tsx";
import Agents from "./app/agents/page.tsx";
import Store from "./app/store/page.tsx";
import Checkout from "./app/checkout/page.tsx";
import CustomRequest from "./app/custom-request/page.tsx";
import Hire from "./app/hire/[agent]/page.tsx";
import History from "./app/history/page.tsx";
import Report from "./app/report/[sessionId]/page.tsx";
import Session from "./app/session/[sessionId]/page.tsx";
import SessionStatus from "./app/session/[sessionId]/status/page.tsx";
import DashboardLayout from "./app/dashboard/layout.tsx";
import Dashboard from "./app/dashboard/page.tsx";
import DashboardLogin from "./app/dashboard/login/page.tsx";
import DashboardVerify from "./app/dashboard/auth/verify/page.tsx";
import DashboardSession from "./app/dashboard/sessions/[id]/page.tsx";
import DashboardWallet from "./app/dashboard/wallet/page.tsx";
import StudioLayout from "./app/studio/layout.tsx";

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/agents", element: <Agents /> },
  { path: "/store", element: <Store /> },
  { path: "/checkout", element: <Checkout /> },
  { path: "/custom-request", element: <CustomRequest /> },
  { path: "/hire/:agent", element: <Hire /> },
  { path: "/history", element: <History /> },
  { path: "/report/:sessionId", element: <Report /> },
  { path: "/session/:sessionId", element: <Session /> },
  { path: "/session/:sessionId/status", element: <SessionStatus /> },
  {
    path: "/dashboard",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "login", element: <DashboardLogin /> },
      { path: "auth/verify", element: <DashboardVerify /> },
      { path: "wallet", element: <DashboardWallet /> },
      { path: "sessions/:id", element: <DashboardSession /> },
    ],
  },
  {
    path: "/studio",
    element: <StudioLayout />,
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
]);
