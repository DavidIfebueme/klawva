import { Route, Routes } from "react-router-dom";
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
import StudioHome from "./app/studio/page.tsx";
import StudioLogin from "./app/studio/login/page.tsx";
import StudioVerify from "./app/studio/auth/verify/page.tsx";
import StudioListing from "./app/studio/listings/[id]/page.tsx";
import StudioCockpit from "./app/studio/cockpit/page.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agents" element={<Agents />} />
      <Route path="/store" element={<Store />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/custom-request" element={<CustomRequest />} />
      <Route path="/hire/:agent" element={<Hire />} />
      <Route path="/history" element={<History />} />
      <Route path="/report/:sessionId" element={<Report />} />
      <Route path="/session/:sessionId" element={<Session />} />
      <Route path="/session/:sessionId/status" element={<SessionStatus />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="login" element={<DashboardLogin />} />
        <Route path="auth/verify" element={<DashboardVerify />} />
        <Route path="wallet" element={<DashboardWallet />} />
        <Route path="sessions/:id" element={<DashboardSession />} />
      </Route>
      <Route path="/studio" element={<StudioLayout />}>
        <Route index element={<StudioHome />} />
        <Route path="login" element={<StudioLogin />} />
        <Route path="auth/verify" element={<StudioVerify />} />
        <Route path="listings/:id" element={<StudioListing />} />
        <Route path="cockpit" element={<StudioCockpit />} />
      </Route>
    </Routes>
  );
}
