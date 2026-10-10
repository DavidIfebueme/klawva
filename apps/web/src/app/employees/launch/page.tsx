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
  return {
    session,
    token,
    botUsername: launch.telegramBotUsername,
    code: launch.code,
    channel: launch.channel,
    agentName: launch.agentName,
    customerEmail: launch.customerEmail,
    brief: launch.brief,
  };
};

export function Component() {
  const { session, token, botUsername, code, channel, agentName, customerEmail, brief } =
    useLoaderData<typeof loader>();
  const link = `https://t.me/${botUsername}?start=${code}`;
  const chatLink = `/chat/${session}?token=${token}`;
  const slackLink = `/api/slack/install?session=${session}&token=${token}`;
  const briefEntries = Object.entries(brief).filter(
    ([, value]) => value.trim().length > 0,
  );

  return (
    <div className="min-h-screen flex flex-col bg-klawva-bg">
      <Navbar />
      <main className="flex-grow pt-24 pb-32 px-6">
        <div className="max-w-xl mx-auto text-center">
          <span className="font-mono text-klawva-accent text-xs uppercase tracking-[0.2em] block mb-3">
            Payment complete
          </span>
          {briefEntries.length > 0 && (
            <div className="text-left bg-klawva-surface border border-klawva-border rounded-lg px-5 py-4 mb-10">
              <p className="font-mono text-klawva-dim text-[10px] uppercase tracking-wider mb-3">
                Your brief
              </p>
              <dl className="flex flex-col gap-2">
                {briefEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-mono text-klawva-dim text-xs capitalize">
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd className="font-mono text-klawva-text text-sm whitespace-pre-wrap">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {channel === "web" ? (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Your employee is on it
              </h1>
              <p className="font-mono text-klawva-muted text-sm mb-10">
                {agentName} has your brief and is on shift for the next 24
                hours. Open the chat to watch it work or redirect it.
              </p>
              <div>
                <Button variant="primary" size="lg" href={chatLink}>
                  Watch it work
                </Button>
              </div>
            </>
          ) : channel === "email" ? (
            <>
              <h1 className="font-syne font-bold text-3xl text-klawva-text mb-4">
                Your employee is on it
              </h1>
              <p className="font-mono text-klawva-muted text-sm mb-10">
                {agentName} has your brief above and is already working. It will
                email you at{" "}
                {customerEmail.length > 0 ? customerEmail : "your address"} as it
                makes progress. Reply to that thread anytime to redirect it.
              </p>
              <div>
                <Button variant="primary" size="lg" href={chatLink}>
                  Watch it work
                </Button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
          <p className="font-mono text-klawva-dim text-xs mt-8">
            {agentName} · 24-hour shift · channel: {channel}
          </p>
          <p className="font-mono text-klawva-dim text-xs mt-6">
            Use a different channel instead
          </p>
          {channel !== "web" && (
            <p className="font-mono text-klawva-dim text-xs mt-2">
              <a href={chatLink} className="text-klawva-accent underline">
                Chat on the web
              </a>
            </p>
          )}
          {channel !== "telegram" && (
            <p className="font-mono text-klawva-dim text-xs mt-2">
              <a href={link} className="text-klawva-accent underline">
                Open Telegram
              </a>
            </p>
          )}
          {channel !== "email" && (
            <p className="font-mono text-klawva-dim text-xs mt-2">
              Prefer email? Your employee will email you. Reply to that thread
              from the address you paid with.
            </p>
          )}
          <p className="font-mono text-klawva-dim text-xs mt-2">
            For teams:{" "}
            <a href={slackLink} className="text-klawva-accent underline">
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
