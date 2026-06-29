'use client';

import React, { useEffect, useState } from 'react';
import { useDashboardAuth } from '@/components/dashboard-auth-provider';
import { getDashboardWallet, createDashboardVirtualAccount, getDashboardWalletTransactions } from '@/lib/api';
import { WalletDetailsResponse, WalletTransactionEntry } from '@/types';
import { Button } from '@/components/ui/Button';
import { Copy, Check, Shield, History, PlusCircle, CreditCard, Landmark, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { motion } from 'motion/react';

export default function WalletPage() {
  const { token, loading: authLoading } = useDashboardAuth();
  const [wallet, setWallet] = useState<WalletDetailsResponse | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingVA, setCreatingVA] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadWalletData = async () => {
    if (!token) return;
    try {
      const [walletInfo, txList] = await Promise.all([
        getDashboardWallet(token),
        getDashboardWalletTransactions(token),
      ]);
      setWallet(walletInfo);
      setTransactions(txList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [token]);

  const handleCreateVirtualAccount = async () => {
    if (!token) return;
    setCreatingVA(true);
    setError('');
    try {
      const updated = await createDashboardVirtualAccount(token);
      setWallet(updated);
      await loadWalletData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create virtual account. Check your server settings and credentials.');
    } finally {
      setCreatingVA(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (authLoading || (loading && !wallet)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-8 h-8 border-2 border-klawva-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-klawva-muted">LOADING VAULT MODULE...</span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header Panel */}
      <div className="border-b border-klawva-border pb-6">
        <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block mb-1">
          Klawva Financial Service
        </span>
        <h2 className="font-syne font-bold text-2xl uppercase text-white">
          Wallet & Funding
        </h2>
        <p className="text-xs text-klawva-muted mt-2 max-w-2xl leading-relaxed">
          Your wallet is used to cover shift renewals. You can generate a dedicated Nigerian Virtual Account and fund it instantly with any local banking application.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Balance Card */}
        <div className="bg-klawva-surface border border-klawva-border p-6 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-klawva-muted tracking-wider">
              Available Balance
            </span>
            <Shield size={16} className="text-klawva-accent" />
          </div>
          <div>
            <span className="text-3xl font-syne font-extrabold text-klawva-accent">
              ₦{(wallet!.balanceMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="block text-[10px] font-mono text-klawva-muted mt-1 uppercase">
              Currency: {wallet!.currency}
            </span>
          </div>
          <div className="pt-4 border-t border-klawva-border">
            <div className="flex justify-between text-xs text-klawva-muted font-mono">
              <span>Minimum Fund:</span>
              <span className="text-klawva-text">₦5,000.00</span>
            </div>
          </div>
        </div>

        {/* Funding Method Account details */}
        <div className="lg:col-span-2 bg-klawva-surface border border-klawva-border p-6 rounded-lg space-y-6">
          {!wallet!.hasVirtualAccount ? (
            <div className="text-center py-6 space-y-4">
              <Landmark size={40} className="text-klawva-dim mx-auto" />
              <div className="space-y-1">
                <h4 className="font-syne text-md font-bold text-white uppercase">
                  Generate Dedicated Bank Account
                </h4>
                <p className="text-xs text-klawva-muted max-w-sm mx-auto leading-relaxed">
                  Create a permanent, static virtual bank account to easily deposit money into your Klawva wallet via bank transfer.
                </p>
              </div>
              {error && (
                <div className="text-xs text-klawva-orange bg-klawva-orange/10 border border-klawva-orange/20 rounded p-3 max-w-sm mx-auto font-mono text-left">
                  {error}
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                loading={creatingVA}
                onClick={handleCreateVirtualAccount}
                className="mt-2"
              >
                Create Bank Account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <span className="text-xs font-mono uppercase text-klawva-accent tracking-wider block mb-1">
                  Active Funding Route
                </span>
                <h4 className="font-syne text-md font-bold text-white uppercase">
                  Your Virtual Bank Account
                </h4>
                <p className="text-[10px] text-klawva-muted font-mono mt-1">
                  Fund this account using any NGN bank app. Deposits will credit your wallet instantly.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {/* Bank account number */}
                <div className="bg-klawva-bg border border-klawva-border p-3 rounded flex justify-between items-center">
                  <div className="font-mono text-left">
                    <span className="block text-[8px] uppercase text-klawva-muted">Account Number</span>
                    <span className="text-sm font-bold text-white tracking-wider">{wallet!.bankAccountNumber}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(wallet!.bankAccountNumber!, 'accountNumber')}
                    className="text-klawva-muted hover:text-klawva-accent transition-colors"
                  >
                    {copiedField === 'accountNumber' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Bank Name */}
                <div className="bg-klawva-bg border border-klawva-border p-3 rounded flex justify-between items-center">
                  <div className="font-mono text-left">
                    <span className="block text-[8px] uppercase text-klawva-muted">Bank Name</span>
                    <span className="text-sm font-bold text-white uppercase">{wallet!.bankName}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(wallet!.bankName!, 'bankName')}
                    className="text-klawva-muted hover:text-klawva-accent transition-colors"
                  >
                    {copiedField === 'bankName' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Bank account name */}
                <div className="bg-klawva-bg border border-klawva-border p-3 rounded flex justify-between items-center">
                  <div className="font-mono text-left truncate pr-2">
                    <span className="block text-[8px] uppercase text-klawva-muted">Account Name</span>
                    <span className="text-xs font-bold text-white uppercase block truncate">{wallet!.bankAccountName}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(wallet!.bankAccountName!, 'accountName')}
                    className="text-klawva-muted hover:text-klawva-accent transition-colors shrink-0"
                  >
                    {copiedField === 'accountName' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-klawva-border pb-3">
          <History size={18} className="text-klawva-accent" />
          <h3 className="font-syne font-bold text-lg uppercase text-white tracking-wider">
            Transaction History
          </h3>
        </div>

        {transactions.length === 0 ? (
          <div className="bg-klawva-surface border border-klawva-border rounded-lg p-10 text-center font-mono text-xs text-klawva-muted">
            No transactions found on this account yet.
          </div>
        ) : (
          <div className="bg-klawva-surface border border-klawva-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-klawva-border bg-klawva-bg/50 uppercase text-[10px] text-klawva-muted">
                    <th className="p-4">Type</th>
                    <th className="p-4">Reference ID</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Balance After</th>
                    <th className="p-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-klawva-border">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-klawva-bg/25 transition-colors">
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 font-bold ${
                          tx.type === 'credit' ? 'text-emerald-400' : 'text-klawva-text'
                        }`}>
                          {tx.type === 'credit' ? (
                            <ArrowUpRight size={14} />
                          ) : (
                            <ArrowDownLeft size={14} />
                          )}
                          <span className="uppercase text-[10px]">{tx.type}</span>
                        </span>
                      </td>
                      <td className="p-4 text-klawva-muted select-all">
                        {tx.id.substring(0, 8)}...
                      </td>
                      <td className="p-4 text-klawva-text">
                        {tx.description}
                      </td>
                      <td className={`p-4 font-bold ${
                        tx.type === 'credit' ? 'text-emerald-400' : 'text-klawva-text'
                      }`}>
                        {tx.type === 'credit' ? '+' : '-'}₦{(tx.amountMinor / 100).toFixed(2)}
                      </td>
                      <td className="p-4 text-klawva-muted">
                        ₦{(tx.balanceAfter / 100).toFixed(2)}
                      </td>
                      <td className="p-4 text-right text-klawva-muted">
                        {new Date(tx.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
