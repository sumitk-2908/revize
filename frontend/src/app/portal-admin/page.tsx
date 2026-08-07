"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/api/core";
import { useRouter } from "next/navigation";
import { Shield, KeyRound, QrCode } from "lucide-react";
import { InlineSpinner } from "@/components/layout/SharedLayouts";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { useNotifications } from "@/app/context/NotificationsContext";

type AuthStep = "MFA_SETUP" | "MFA_VERIFY";

function AdminPortalLoginContent() {
  const router = useRouter();
  
  const [isChecking, setIsChecking] = useState(true);
  const [step, setStep] = useState<AuthStep | null>(null);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const { setGlobalToast } = useNotifications();
  const setToast = (t: { open: boolean, message: string, type: string }) => {
    setGlobalToast({ open: t.open, title: t.type === 'error' ? 'Authentication Error' : 'Success', message: t.message, type: t.type });
  };

  useEffect(() => {
    const initializeMFA = async () => {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === "aal2") {
        router.push("/subject/admin/inbox");
        return;
      }

      try {
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        // listFactors() only populates `totp` with verified factors; unverified
        // ones are in `all`, and must be cleared or re-enrollment collides.
        const totpFactor = factorsData?.all?.find((f) => f.factor_type === "totp");

        if (!totpFactor || totpFactor.status !== "verified") {
          if (totpFactor) await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });

          const { data: enrollData, error } = await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: `admin-totp-${Date.now()}`,
          });
          if (error) throw error;

          setFactorId(enrollData.id);
          setQrCode(enrollData.totp.qr_code);
          setStep("MFA_SETUP");
        } else {
          setFactorId(totpFactor.id);
          setStep("MFA_VERIFY");
        }
      } catch (err: any) {
        setToast({ open: true, message: "MFA Setup Error: " + err.message, type: "error" });
      } finally {
        setIsChecking(false);
      }
    };

    initializeMFA();
  }, [router]);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: otp,
      });
      if (verifyError) throw verifyError;

      router.refresh();
      router.push("/subject/admin/inbox");
    } catch (err: any) {
      setToast({ open: true, message: `Invalid Authenticator Code: ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (isChecking) return <div className="min-h-screen bg-background" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <Shield size={32} />
            </div>
            <h1 className="text-2xl font-extrabold text-foreground">Elevate to Admin</h1>
            <p className="mt-2 text-sm text-muted">
              {step === "MFA_SETUP"
                ? "Scan this QR code in Google or Microsoft Authenticator."
                : "Enter the 6-digit code from your Authenticator app."}
            </p>
          </div>

          {step === "MFA_SETUP" && (
            <div className="flex flex-col items-center space-y-6">
              <div className="rounded-xl border-4 border-white bg-surface p-2 shadow-sm">
                <img
                  src={qrCode}
                  alt="MFA Setup QR Code"
                  className="size-48 bg-white"
                />
              </div>
              <form onSubmit={handleVerifyOTP} className="w-full space-y-4">
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit code"
                  className="h-12 w-full rounded-xl border border-border bg-transparent px-4 text-center text-xl tracking-widest outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {loading ? (
                    <InlineSpinner label="Verifying MFA" size={18} />
                  ) : (
                    <>
                      <QrCode size={18} /> Verify & Activate MFA
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {step === "MFA_VERIFY" && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <input
                required
                autoFocus
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                className="h-12 w-full rounded-xl border border-border bg-transparent px-4 text-center text-xl tracking-widest outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                {loading ? (
                  <InlineSpinner label="Verifying access" size={18} />
                ) : (
                  <>
                    <KeyRound size={18} /> Verify Access
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
  );
}

export default function AdminPortalLogin() {
  return (
    <ErrorBoundary
      title="Admin access could not load"
      message="The admin sign-in flow hit an unexpected problem. Retry this section when you are ready."
    >
      <AdminPortalLoginContent />
    </ErrorBoundary>
  );
}
