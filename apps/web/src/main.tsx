import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes.tsx";
import "./index.css";

const container = document.getElementById("root");
if (container !== null) {
  createRoot(container).render(<RouterProvider router={router} />);
}
