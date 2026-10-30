import React, { useState } from "react";
import { useRevalidator } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Toast, type ToastState } from "@/components/ui/Toast";
import { handleActionAuthError } from "@/lib/studio-loader";
import {
  saveAuthorName,
  saveAuthorPayout,
  type AuthorEarnings,
  type AuthorLimits,
  type AuthorPayout,
} from "@/lib/studio-api";
import { Wallet } from "lucide-react";

const inputClass =
  "w-full h-11 bg-klawva-bg border border-klawva-border rounded px-4 text-sm text-klawva-text placeholder-klawva-dim focus:border-klawva-accent focus:outline-none transition-colors font-mono";

const labelClass =
  "block text-xs uppercase tracking-wider text-klawva-muted mb-2";

const naira = (minor: number): string => `₦${(minor / 100).toLocaleString()}`;

function PayoutForm({
  token,
  payout,
  onDone,
}: {
  token: string;
  payout: AuthorPayout | null;
  onDone: (message: string) => void;
}) {
  const [psp, setPsp] = useState<"paystack" | "flutterwave">(
    payout?.psp === "flutterwave" ? "flutterwave" : "paystack",
  );
  const [subaccount, setSubaccount] = useState(payout?.subaccount ?? "");
  const [country, setCountry] = useState(payout?.country ?? "NG");
  const [currency, setCurrency] = useState(payout?.currency ?? "NGN");
  const [tin, setTin] = useState(payout?.tin ?? "");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready =
    acceptTerms &&
    subaccount.trim().length > 0 &&
    country.trim().length > 0 &&
    currency.trim().length > 0 &&
    tin.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      await saveAuthorPayout(token, {
        psp,
        subaccount: subaccount.trim(),
        country: country.trim(),
        currency: currency.trim(),
        tin: tin.trim(),
        acceptTerms,
      });
      onDone("Payout account saved.");
    } catch (err) {
      if (handleActionAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Could not save payout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="payout-psp">
            Provider
          </label>
          <select
            id="payout-psp"
            className={inputClass}
            value={psp}
            onChange={(e) =>
              setPsp(e.target.value === "flutterwave" ? "flutterwave" : "paystack")
            }
          >
            <option value="paystack">paystack</option>
            <option value="flutterwave">flutterwave</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-subaccount">
            Subaccount
          </label>
          <input
            id="payout-subaccount"
            required
            className={inputClass}
            value={subaccount}
            onChange={(e) => setSubaccount(e.target.value)}
            placeholder="ACCT_xxxxx"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-country">
            Country
          </label>
          <input
            id="payout-country"
            required
            className={inputClass}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="NG"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="payout-currency">
            Currency
          </label>
          <input
            id="payout-currency"
            required
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="NGN"
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass} htmlFor="payout-tin">
            TIN
          </label>
          <input
            id="payout-tin"
            required
            className={inputClass}
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            placeholder="Tax identification number"
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-klawva-muted font-mono cursor-pointer">
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="accent-klawva-accent h-4 w-4 mt-0.5"
        />
        <span>
          I accept the payout terms and confirm these payout details are mine.
        </span>
      </label>
      {error && (
        <p className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 font-mono">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!ready}>
        Save payout account
      </Button>
    </form>
  );
}

export function AuthorMoney({
  token,
  limits,
  payout,
  earnings,
  displayName,
}: {
  token: string;
  limits: AuthorLimits | null;
  payout: AuthorPayout | null;
  earnings: AuthorEarnings | null;
  displayName: string;
}) {
  const revalidator = useRevalidator();
  const [name, setName] = useState(displayName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState("");
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const linked =
    payout !== null &&
    payout.subaccount !== null &&
    payout.subaccount.trim().length > 0;

  const handleName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameBusy(true);
    setNameError("");
    try {
      await saveAuthorName(token, name);
      showToast("Author name saved.");
      revalidator.revalidate();
    } catch (err) {
      if (handleActionAuthError(err)) return;
      setNameError(err instanceof Error ? err.message : "Could not save the name.");
    } finally {
      setNameBusy(false);
    }
  };

  const showToast = (message: string) => {
    setToast({ kind: "success", message });
    window.setTimeout(() => setToast(null), 5000);
  };

  const tier = limits?.tier ?? payout?.tier ?? 0;
  const currency = earnings?.currency ?? payout?.currency ?? "NGN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-syne font-bold text-lg uppercase text-white tracking-wider">
          Author Money
        </h2>
        <div className="flex items-center gap-3 font-mono text-xs text-klawva-muted">
          <span className="uppercase tracking-wider">Tier {tier}</span>
          {limits && (
            <span className="uppercase tracking-wider">
              {limits.used} / {limits.cap} listings
            </span>
          )}
        </div>
      </div>

      <Card>
        <form onSubmit={handleName} className="flex flex-wrap items-end gap-3">
          <div className="flex-grow min-w-[220px]">
            <label className={labelClass} htmlFor="author-name">
              Author name
            </label>
            <input
              id="author-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shown on your listings"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={nameBusy}
            disabled={name.trim().length < 2}
          >
            SAVE NAME
          </Button>
        </form>
        {nameError && (
          <p className="font-mono text-xs text-klawva-orange mt-3">{nameError}</p>
        )}
        <p className="font-mono text-xs text-klawva-dim mt-3">
          Shown on every listing you publish, and to customers on the checkout consent line.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider">
              Payout account
            </span>
            {linked ? (
              <Badge variant="active">{payout?.status ?? "linked"}</Badge>
            ) : (
              <Badge variant="warning">not linked</Badge>
            )}
          </div>

          {linked && !editing ? (
            <div className="space-y-2 font-mono text-sm">
              <p className="text-klawva-text">
                {payout?.psp ?? "—"} · {payout?.subaccount}
              </p>
              <p className="text-klawva-muted text-xs">
                {payout?.currency ?? currency} · TIN {payout?.tin ?? "—"} · Tier{" "}
                {tier}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Edit payout account
              </Button>
            </div>
          ) : (
            <PayoutForm
              token={token}
              payout={payout}
              onDone={(message) => {
                setEditing(false);
                showToast(message);
                revalidator.revalidate();
              }}
            />
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider">
              Net to you
            </span>
            <Wallet size={16} className="text-klawva-accent" />
          </div>
          {earnings === null ? (
            <p className="text-sm text-klawva-muted">Earnings are not available yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="font-syne font-extrabold text-3xl text-klawva-accent">
                {naira(earnings.pending.netMinor)}
              </div>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div>
                  <p className="text-klawva-muted uppercase tracking-wider">Gross</p>
                  <p className="text-klawva-text mt-1">
                    {naira(earnings.pending.grossMinor)}
                  </p>
                </div>
                <div>
                  <p className="text-klawva-muted uppercase tracking-wider">
                    Commission
                  </p>
                  <p className="text-klawva-text mt-1">
                    {naira(earnings.pending.commissionMinor)}
                  </p>
                </div>
              </div>
              <p className="font-mono text-klawva-dim text-xs">
                Pending for the current month.
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider">
          Payout instructions
        </span>
        {earnings === null || earnings.instructions.length === 0 ? (
          <p className="text-sm text-klawva-muted mt-4">
            No payout instructions yet. They appear after your first paid shift.
          </p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-klawva-muted uppercase tracking-wider text-left border-b border-klawva-border">
                  <th className="py-3 pr-4">Period</th>
                  <th className="py-3 pr-4">Gross</th>
                  <th className="py-3 pr-4">Commission</th>
                  <th className="py-3 pr-4">WHT</th>
                  <th className="py-3 pr-4">Net</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {earnings.instructions.map((row, index) => (
                  <tr
                    key={`${row.period}-${index}`}
                    className="border-b border-klawva-border/50"
                  >
                    <td className="py-3 pr-4 text-klawva-muted whitespace-nowrap">
                      {row.period}
                    </td>
                    <td className="py-3 pr-4 text-klawva-text">
                      {naira(row.grossMinor)}
                    </td>
                    <td className="py-3 pr-4 text-klawva-muted">
                      {naira(row.commissionMinor)}
                    </td>
                    <td className="py-3 pr-4 text-klawva-muted">
                      {naira(row.whtMinor)}
                    </td>
                    <td className="py-3 pr-4 text-klawva-accent">
                      {naira(row.netMinor)}
                    </td>
                    <td className="py-3 text-klawva-muted uppercase tracking-wider">
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
