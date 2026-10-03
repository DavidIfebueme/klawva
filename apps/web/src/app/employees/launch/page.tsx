import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { getSessionLaunch } from "@/lib/employees-api";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const session = params.session ?? url.searchParams.get("session");
  const token = params.token ?? url.searchParams.get("token");
  if (session == null || token == null) {
    throw redirect("/employees");
  }
  const launch = await getSessionLaunch(session, token);
  return { session, token, botUsername: launch.telegramBotUsername, code: launch.code };
};

export function Component() {
  const { session, token, botUsername, code } = useLoaderData<typeof loader>();
  const link = `https://t.me/${botUsername}?start=${code}`;

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-xl mx-auto text-center">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Payment complete
          </span>
          <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
            Start your employee on Telegram
          </h1>
          <p className="font-mono text-klawva-muted text-sm mb-10">
            Scan the code or tap the button. This opens the bot and links it to
            your shift. Then just message it.
          </p>
          <div className="inline-block bg-white p-4 rounded-lg mb-8">
            <QRCodeSVG value={link} size={200} />
          </div>
          <div>
            <Button variant="primary" size="lg" href={link}>
              Open Telegram
            </Button>
          </div>
          <p className="font-mono text-klawva-dim text-xs mt-6">
            Prefer the browser?{" "}
            <a href={`/chat/${session}?token=${token}`} className="text-klawva-accent underline">
              Chat on the web
            </a>
          </p>
          <p className="font-mono text-klawva-dim text-xs mt-2">
            Or email employee-{session}@mail.klawva.xyz
          </p>
          <p className="font-mono text-klawva-dim text-xs mt-2">
            For teams:{" "}
            <a
              href={`/api/slack/install?session=${session}`}
              className="text-klawva-accent underline"
            >
              Connect Slack
            </a>
          </p>
          <p className="font-mono text-klawva-dim text-xs mt-8 break-all">{link}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
