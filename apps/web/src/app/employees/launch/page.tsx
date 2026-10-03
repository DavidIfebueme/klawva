import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { getConfig } from "@/lib/employees-api";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const session = url.searchParams.get("session");
  if (session === null) {
    throw redirect("/employees");
  }
  const cfg = await getConfig();
  return { session, botUsername: cfg.telegramBotUsername };
};

export function Component() {
  const { session, botUsername } = useLoaderData<typeof loader>();
  const link = `https://t.me/${botUsername}?start=${session}`;

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
          <p className="font-mono text-klawva-dim text-xs mt-8 break-all">{link}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
