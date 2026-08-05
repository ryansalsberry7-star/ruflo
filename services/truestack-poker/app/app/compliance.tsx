import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from './lib/auth';
import { API_BASE_URL } from './lib/api';

type KycStatus = 'unstarted' | 'pending' | 'verified' | 'rejected';
type DocumentType = 'passport' | 'drivers-license' | 'national-id';
type FundingMode = 'standard' | 'instant';

interface ComplianceDecision {
  accountId: string;
  canPlayRealMoney: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  kycStatus: KycStatus;
  jurisdiction: string | null;
  realMoneyEnabled: boolean;
  remainingDailyDeposit: number;
  reasons: string[];
}

interface KycProfile {
  status: KycStatus;
  fullName: string | null;
  dateOfBirth: string | null;
  jurisdiction: string | null;
  documentType: DocumentType | null;
  rejectionReason: string | null;
}

interface ResponsibleGamingProfile {
  maxDailyDeposit: number;
  maxSessionMinutes: number;
  selfExcluded: boolean;
}

interface StatusResponse {
  decision: ComplianceDecision;
  kyc: KycProfile;
  responsibleGaming: ResponsibleGamingProfile;
}

interface WalletState {
  balance: number;
  availableChips: number;
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; reasons?: string[] };
}

async function callApi<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string | null; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data: unknown = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data: data as ApiResult<T>['data'] };
}

const DOCUMENT_TYPES: { id: DocumentType; label: string }[] = [
  { id: 'passport', label: 'Passport' },
  { id: 'drivers-license', label: "Driver's license" },
  { id: 'national-id', label: 'National ID' },
];

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOk : styles.pillBlocked]}>
      <Text style={[styles.pillText, ok ? styles.pillTextOk : styles.pillTextBlocked]}>{`${ok ? '✓' : '✕'} ${label}`}</Text>
    </View>
  );
}

export default function ComplianceScreen() {
  const { user, authToken } = useAuth();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error' | 'info'; message: string } | null>(null);

  // KYC form
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [jurisdiction, setJurisdiction] = useState('US-NV');
  const [documentType, setDocumentType] = useState<DocumentType>('passport');

  // Funding form
  const [amount, setAmount] = useState('50');
  const [fundingMode, setFundingMode] = useState<FundingMode>('standard');

  // Responsible gaming
  const [maxDailyDeposit, setMaxDailyDeposit] = useState('');
  const [maxSessionMinutes, setMaxSessionMinutes] = useState('');

  const refresh = useCallback(async () => {
    if (!user || !authToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [statusResult, walletResult] = await Promise.all([
        callApi<StatusResponse>(`/api/compliance/status/${user.userId}?jurisdiction=${encodeURIComponent(jurisdiction)}`, {
          token: authToken,
        }),
        callApi<{ wallet: WalletState }>(`/api/wallet/${user.userId}`, { token: authToken }),
      ]);
      if (statusResult.ok) {
        setStatus(statusResult.data);
        if (statusResult.data.kyc.fullName) setFullName(statusResult.data.kyc.fullName);
        if (statusResult.data.kyc.dateOfBirth) setDateOfBirth(statusResult.data.kyc.dateOfBirth);
        if (statusResult.data.kyc.jurisdiction) setJurisdiction(statusResult.data.kyc.jurisdiction);
        if (statusResult.data.kyc.documentType) setDocumentType(statusResult.data.kyc.documentType);
        setMaxDailyDeposit(String(statusResult.data.responsibleGaming.maxDailyDeposit));
        setMaxSessionMinutes(String(statusResult.data.responsibleGaming.maxSessionMinutes));
      }
      if (walletResult.ok) {
        setWallet((walletResult.data as { wallet: WalletState }).wallet);
      }
    } catch (error) {
      setBanner({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to load compliance status.' });
    } finally {
      setLoading(false);
    }
  }, [user, authToken, jurisdiction]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authToken]);

  async function submitKyc(): Promise<void> {
    if (!authToken) return;
    const result = await callApi<{ kyc: KycProfile }>('/api/compliance/kyc/submit', {
      method: 'POST',
      token: authToken,
      body: { fullName, dateOfBirth, jurisdiction, documentType },
    });
    if (result.ok) {
      setBanner({ tone: 'ok', message: 'Identity documents submitted. Verification is pending review.' });
      void refresh();
    } else {
      setBanner({ tone: 'error', message: result.data.error ?? 'KYC submission failed.' });
    }
  }

  async function submitFunding(kind: 'deposit' | 'withdraw'): Promise<void> {
    if (!authToken) return;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setBanner({ tone: 'error', message: 'Enter a valid amount greater than zero.' });
      return;
    }
    const result = await callApi<{ wallet: WalletState }>(`/api/wallet/${kind}`, {
      method: 'POST',
      token: authToken,
      body: { amount: numeric, mode: fundingMode, jurisdiction },
    });
    if (result.ok) {
      setWallet((result.data as { wallet: WalletState }).wallet);
      setBanner({ tone: 'ok', message: `${kind === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${formatUsd(numeric)} completed.` });
      void refresh();
    } else {
      const reasons = result.data.reasons?.length ? result.data.reasons.join(' ') : result.data.error ?? 'Request blocked.';
      setBanner({ tone: 'error', message: `${kind === 'deposit' ? 'Deposit' : 'Withdrawal'} blocked: ${reasons}` });
    }
  }

  async function saveLimits(): Promise<void> {
    if (!authToken) return;
    const result = await callApi<{ profile: ResponsibleGamingProfile }>('/api/compliance/limits', {
      method: 'POST',
      token: authToken,
      body: {
        maxDailyDeposit: maxDailyDeposit ? Number(maxDailyDeposit) : undefined,
        maxSessionMinutes: maxSessionMinutes ? Number(maxSessionMinutes) : undefined,
      },
    });
    if (result.ok) {
      setBanner({ tone: 'ok', message: 'Responsible-gaming limits updated.' });
      void refresh();
    } else {
      setBanner({ tone: 'error', message: result.data.error ?? 'Could not update limits.' });
    }
  }

  async function toggleSelfExclusion(enabled: boolean): Promise<void> {
    if (!authToken) return;
    const result = await callApi<{ profile: ResponsibleGamingProfile }>('/api/compliance/self-exclude', {
      method: 'POST',
      token: authToken,
      body: { enabled },
    });
    if (result.ok) {
      setBanner({ tone: enabled ? 'info' : 'ok', message: enabled ? 'Self-exclusion enabled. Real-money play is now blocked.' : 'Self-exclusion lifted.' });
      void refresh();
    } else {
      setBanner({ tone: 'error', message: result.data.error ?? 'Could not update self-exclusion.' });
    }
  }

  if (!user) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>REAL-MONEY ACCOUNT</Text>
          <Text style={styles.title}>Verification &amp; funding</Text>
          <Text style={styles.subtitle}>Sign in to manage identity verification, deposits, withdrawals, and responsible-gaming limits.</Text>
        </View>
        <Link href="/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryText}>Sign in to continue</Text>
          </Pressable>
        </Link>
      </ScrollView>
    );
  }

  const decision = status?.decision;
  const kyc = status?.kyc;
  const rg = status?.responsibleGaming;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>REAL-MONEY ACCOUNT</Text>
        <Text style={styles.title}>Verification &amp; funding</Text>
        <Text style={styles.subtitle}>Signed in as {user.username} ({user.userId}). Real-money play is gated on KYC, region, age, and responsible-gaming checks.</Text>
      </View>

      {banner ? (
        <View style={[styles.banner, banner.tone === 'ok' ? styles.bannerOk : banner.tone === 'info' ? styles.bannerInfo : styles.bannerError]}>
          <Text style={styles.bannerText}>{banner.message}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#7ED3FF" />
          <Text style={styles.metric}>Loading compliance status…</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Eligibility</Text>
        {decision ? (
          <>
            <View style={styles.pillRow}>
              <StatusPill ok={decision.canPlayRealMoney} label="Play" />
              <StatusPill ok={decision.canDeposit} label="Deposit" />
              <StatusPill ok={decision.canWithdraw} label="Withdraw" />
            </View>
            <Text style={styles.metric}>KYC status: {decision.kycStatus}</Text>
            <Text style={styles.metric}>Jurisdiction: {decision.jurisdiction ?? '—'}</Text>
            <Text style={styles.metric}>Remaining daily deposit: {formatUsd(decision.remainingDailyDeposit)}</Text>
            <Text style={styles.metric}>Real-money mode: {decision.realMoneyEnabled ? 'enabled' : 'disabled in this environment'}</Text>
            {decision.reasons.length ? (
              <View style={styles.reasonsBox}>
                {decision.reasons.map((reason, index) => (
                  <Text key={index} style={styles.reasonText}>• {reason}</Text>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.metric}>Status unavailable.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Identity verification (KYC)</Text>
        {kyc?.status === 'verified' ? (
          <Text style={styles.metricOk}>Identity verified for {kyc.fullName}. No further action required.</Text>
        ) : null}
        {kyc?.status === 'rejected' && kyc.rejectionReason ? (
          <Text style={styles.metricError}>Rejected: {kyc.rejectionReason}</Text>
        ) : null}
        <Text style={styles.label}>Full legal name</Text>
        <TextInput style={styles.input} placeholder="Ada Lovelace" placeholderTextColor="#5C6B90" value={fullName} onChangeText={setFullName} />
        <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} placeholder="1990-01-31" placeholderTextColor="#5C6B90" value={dateOfBirth} onChangeText={setDateOfBirth} autoCapitalize="none" />
        <Text style={styles.label}>Jurisdiction (e.g. US-NV)</Text>
        <TextInput
          style={styles.input}
          placeholder="US-NV"
          placeholderTextColor="#5C6B90"
          value={jurisdiction}
          onChangeText={(text) => setJurisdiction(text.toUpperCase())}
          autoCapitalize="characters"
        />
        <Text style={styles.label}>Document type</Text>
        <View style={styles.segment}>
          {DOCUMENT_TYPES.map((doc) => (
            <Pressable
              key={doc.id}
              style={[styles.segmentButton, documentType === doc.id && styles.segmentButtonActive]}
              onPress={() => setDocumentType(doc.id)}
            >
              <Text style={[styles.segmentText, documentType === doc.id && styles.segmentTextActive]}>{doc.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.primaryButton} onPress={() => void submitKyc()}>
          <Text style={styles.primaryText}>{kyc?.status === 'pending' ? 'Resubmit documents' : 'Submit for verification'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Deposit &amp; withdraw</Text>
        <Text style={styles.metric}>Wallet balance: {wallet ? formatUsd(wallet.availableChips) : '—'}</Text>
        <Text style={styles.label}>Amount (USD)</Text>
        <TextInput style={styles.input} placeholder="50" placeholderTextColor="#5C6B90" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Text style={styles.label}>Transfer speed</Text>
        <View style={styles.segment}>
          {(['standard', 'instant'] as FundingMode[]).map((mode) => (
            <Pressable key={mode} style={[styles.segmentButton, fundingMode === mode && styles.segmentButtonActive]} onPress={() => setFundingMode(mode)}>
              <Text style={[styles.segmentText, fundingMode === mode && styles.segmentTextActive]}>{mode === 'standard' ? 'Standard' : 'Instant'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable style={[styles.primaryButton, styles.flex1]} onPress={() => void submitFunding('deposit')}>
            <Text style={styles.primaryText}>Deposit</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, styles.flex1]} onPress={() => void submitFunding('withdraw')}>
            <Text style={styles.secondaryText}>Withdraw</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Responsible gaming</Text>
        <Text style={styles.label}>Max daily deposit (USD)</Text>
        <TextInput style={styles.input} placeholder="500" placeholderTextColor="#5C6B90" value={maxDailyDeposit} onChangeText={setMaxDailyDeposit} keyboardType="number-pad" />
        <Text style={styles.label}>Max session length (minutes)</Text>
        <TextInput style={styles.input} placeholder="120" placeholderTextColor="#5C6B90" value={maxSessionMinutes} onChangeText={setMaxSessionMinutes} keyboardType="number-pad" />
        <Pressable style={styles.secondaryButton} onPress={() => void saveLimits()}>
          <Text style={styles.secondaryText}>Save limits</Text>
        </Pressable>
        <View style={styles.switchRow}>
          <View style={styles.flex1}>
            <Text style={styles.switchLabel}>Self-exclude</Text>
            <Text style={styles.switchHint}>Immediately blocks all real-money play and deposits.</Text>
          </View>
          <Switch value={rg?.selfExcluded ?? false} onValueChange={(value) => void toggleSelfExclusion(value)} />
        </View>
      </View>

      <Link href="/wallet" asChild>
        <Pressable style={styles.inlineButton}>
          <Text style={styles.inlineButtonText}>Back to wallet</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { paddingHorizontal: 24, paddingTop: 58, paddingBottom: 40, gap: 14 },
  header: { gap: 8 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A5B4D5', lineHeight: 20 },
  card: { backgroundColor: '#12172D', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#23304E', gap: 10 },
  cardTitle: { color: '#E5EEFF', fontSize: 17, fontWeight: '800' },
  metric: { color: '#A7B0CF', fontSize: 14 },
  metricOk: { color: '#7CE7B0', fontSize: 14, fontWeight: '600' },
  metricError: { color: '#FF9B9B', fontSize: 14, fontWeight: '600' },
  label: { color: '#8FA0C6', fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: {
    backgroundColor: '#0F1A32',
    borderWidth: 1,
    borderColor: '#2C4269',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F1F5FF',
    fontSize: 15,
  },
  segment: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segmentButton: {
    borderWidth: 1,
    borderColor: '#2C4269',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0F1A32',
  },
  segmentButtonActive: { backgroundColor: '#204079', borderColor: '#3E8FFF' },
  segmentText: { color: '#A7B0CF', fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: '#EAF2FF' },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1 },
  pillOk: { backgroundColor: '#123726', borderColor: '#1F7A4D' },
  pillBlocked: { backgroundColor: '#3A1622', borderColor: '#7A2740' },
  pillText: { fontSize: 13, fontWeight: '700' },
  pillTextOk: { color: '#7CE7B0' },
  pillTextBlocked: { color: '#FF9BB0' },
  reasonsBox: { marginTop: 4, gap: 4, borderTopWidth: 1, borderTopColor: '#23304E', paddingTop: 8 },
  reasonText: { color: '#C4CDE8', fontSize: 13, lineHeight: 18 },
  banner: { borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerOk: { backgroundColor: '#123726', borderColor: '#1F7A4D' },
  bannerInfo: { backgroundColor: '#1B2A4A', borderColor: '#3E8FFF' },
  bannerError: { backgroundColor: '#3A1622', borderColor: '#7A2740' },
  bannerText: { color: '#EAF2FF', fontSize: 14, lineHeight: 19 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  switchLabel: { color: '#F1F5FF', fontSize: 15, fontWeight: '700' },
  switchHint: { color: '#8FA0C6', fontSize: 12, marginTop: 2 },
  primaryButton: { borderRadius: 12, backgroundColor: '#3E8FFF', alignItems: 'center', paddingVertical: 13, marginTop: 4 },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3D598D',
    backgroundColor: '#152642',
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 4,
  },
  secondaryText: { color: '#E8F1FF', fontWeight: '700', fontSize: 15 },
  inlineButton: { alignItems: 'center', paddingVertical: 10 },
  inlineButtonText: { color: '#7ED3FF', fontWeight: '700' },
});
