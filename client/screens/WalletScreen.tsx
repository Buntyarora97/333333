import React, { useState } from "react";
import {
  View, StyleSheet, TextInput, Pressable, FlatList,
  ActivityIndicator, ScrollView, Alert, Linking, Clipboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { CoinDisplay } from "@/components/CoinDisplay";
import { Button } from "@/components/Button";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { Colors, Spacing, BorderRadius, GameColors } from "@/constants/theme";
import type { UpiPaymentInfo } from "@/hooks/useWallet";

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

type Step = "amount" | "payment" | "utr" | "success";

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user, refreshUser } = useAuth();
  const { transactions, initiatePayment, isInitiatingPayment, submitDeposit, isSubmittingDeposit } = useWallet();

  const [activeTab, setActiveTab] = useState<"deposit" | "history">("deposit");
  const [step, setStep] = useState<Step>("amount");
  const [amount, setAmount] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<UpiPaymentInfo | null>(null);
  const [utrId, setUtrId] = useState("");
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [upiCopied, setUpiCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleAmountContinue = async () => {
    const num = parseInt(amount);
    if (isNaN(num) || num < 100) {
      Alert.alert("Invalid Amount", "Minimum deposit is ₹100");
      return;
    }
    setErrorMsg("");
    try {
      const info = await initiatePayment(num);
      setPaymentInfo(info);
      setStep("payment");
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to initiate payment");
    }
  };

  const handleCopyUpi = () => {
    if (!paymentInfo) return;
    Clipboard.setString(paymentInfo.upiId);
    setUpiCopied(true);
    Haptics.selectionAsync();
    setTimeout(() => setUpiCopied(false), 2000);
  };

  const handleOpenApp = (deeplink: string, appName: string) => {
    setSelectedApp(appName);
    Linking.openURL(deeplink).catch(() => {
      Alert.alert("App not found", `${appName} is not installed. Please use the UPI ID to pay manually.`);
    });
  };

  const handleSubmitUtr = async () => {
    if (!utrId.trim() || utrId.trim().length < 6) {
      Alert.alert("Invalid UTR", "Please enter a valid UTR ID (at least 6 digits)");
      return;
    }
    if (!paymentInfo) return;
    try {
      await submitDeposit({
        amount: paymentInfo.amount,
        paymentId: paymentInfo.paymentId,
        utrId: utrId.trim(),
        upiApp: selectedApp,
      });
      setStep("success");
      setUtrId("");
      setAmount("");
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to submit deposit");
    }
  };

  const resetFlow = () => {
    setStep("amount");
    setPaymentInfo(null);
    setUtrId("");
    setSelectedApp("");
    setErrorMsg("");
    setAmount("");
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case "deposit": return "Deposit";
      case "withdrawal": return "Withdrawal";
      case "admin_credit": return "Admin Credit";
      case "win": return "Win";
      case "bet": return "Bet";
      case "commission_l1": return "Referral Bonus (L1)";
      case "commission_l2": return "Referral Bonus (L2)";
      default: return type;
    }
  };

  const isCredit = (type: string) => ["deposit", "admin_credit", "win", "commission_l1", "commission_l2"].includes(type);

  const renderTransaction = ({ item }: { item: any }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionIcon}>
        <Feather
          name={isCredit(item.type) ? "arrow-down-circle" : "arrow-up-circle"}
          size={24}
          color={isCredit(item.type) ? GameColors.green : GameColors.red}
        />
      </View>
      <View style={styles.transactionDetails}>
        <ThemedText style={styles.transactionType}>{getTransactionLabel(item.type)}</ThemedText>
        <ThemedText style={styles.transactionDate}>
          {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </ThemedText>
        {item.utrId && <ThemedText style={styles.transactionUtr}>UTR: {item.utrId}</ThemedText>}
      </View>
      <View style={styles.transactionRight}>
        <ThemedText style={[styles.transactionAmount, { color: isCredit(item.type) ? GameColors.green : GameColors.red }]}>
          {isCredit(item.type) ? "+" : "-"}₹{item.amount.toLocaleString()}
        </ThemedText>
        <View style={[styles.statusBadge, { backgroundColor: item.status === "completed" ? "rgba(46,160,67,0.2)" : item.status === "pending" ? "rgba(210,153,34,0.2)" : "rgba(248,81,73,0.2)" }]}>
          <ThemedText style={[styles.statusText, { color: item.status === "completed" ? GameColors.green : item.status === "pending" ? GameColors.yellow : GameColors.red }]}>
            {item.status}
          </ThemedText>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
        <CoinDisplay balance={user?.balance ?? 0} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, activeTab === "deposit" && styles.tabActive]} onPress={() => setActiveTab("deposit")}>
          <ThemedText style={[styles.tabText, activeTab === "deposit" && styles.tabTextActive]}>💰 Add Money</ThemedText>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === "history" && styles.tabActive]} onPress={() => setActiveTab("history")}>
          <ThemedText style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>📋 History</ThemedText>
        </Pressable>
      </View>

      {activeTab === "deposit" ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}>
          {/* Step 1: Enter Amount */}
          {step === "amount" && (
            <View>
              <ThemedText style={styles.stepTitle}>Enter Amount</ThemedText>
              {errorMsg ? <View style={styles.errorBanner}><ThemedText style={styles.errorText}>{errorMsg}</ThemedText></View> : null}

              <View style={styles.amountInputContainer}>
                <ThemedText style={styles.currencySymbol}>₹</ThemedText>
                <TextInput
                  style={styles.amountInput}
                  placeholder="Enter amount"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.quickAmounts}>
                {QUICK_AMOUNTS.map((amt) => (
                  <Pressable
                    key={amt}
                    style={[styles.quickAmountButton, amount === amt.toString() && styles.quickAmountButtonActive]}
                    onPress={() => { Haptics.selectionAsync(); setAmount(amt.toString()); }}
                  >
                    <ThemedText style={[styles.quickAmountText, amount === amt.toString() && styles.quickAmountTextActive]}>
                      ₹{amt.toLocaleString()}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <Button onPress={handleAmountContinue} disabled={isInitiatingPayment || !amount || parseInt(amount) < 100} style={styles.primaryButton}>
                {isInitiatingPayment ? <ActivityIndicator color="#FFF" size="small" /> : "Continue to Payment"}
              </Button>
              <ThemedText style={styles.minNote}>Minimum deposit: ₹100</ThemedText>
            </View>
          )}

          {/* Step 2: Pay via UPI */}
          {step === "payment" && paymentInfo && (
            <View>
              <View style={styles.stepHeader}>
                <Pressable onPress={resetFlow} style={styles.backBtn}>
                  <Feather name="arrow-left" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
                <ThemedText style={styles.stepTitle}>Pay ₹{paymentInfo.amount.toLocaleString()}</ThemedText>
              </View>

              {/* UPI ID Display */}
              <View style={styles.upiCard}>
                <ThemedText style={styles.upiLabel}>Pay to UPI ID</ThemedText>
                <View style={styles.upiIdRow}>
                  <ThemedText style={styles.upiIdText}>{paymentInfo.upiId}</ThemedText>
                  <Pressable style={[styles.copyBtn, upiCopied && styles.copyBtnSuccess]} onPress={handleCopyUpi}>
                    <Feather name={upiCopied ? "check" : "copy"} size={16} color={upiCopied ? GameColors.green : Colors.dark.textSecondary} />
                    <ThemedText style={[styles.copyBtnText, upiCopied && { color: GameColors.green }]}>
                      {upiCopied ? "Copied!" : "Copy"}
                    </ThemedText>
                  </Pressable>
                </View>
                <ThemedText style={styles.upiName}>{paymentInfo.upiName}</ThemedText>
                <View style={styles.amountChip}>
                  <ThemedText style={styles.amountChipText}>₹{paymentInfo.amount.toLocaleString()}</ThemedText>
                </View>
              </View>

              {/* UPI Apps */}
              <ThemedText style={styles.sectionLabel}>Pay with App</ThemedText>
              <View style={styles.appRow}>
                {paymentInfo.apps.map((app) => (
                  <Pressable
                    key={app.name}
                    style={[styles.appBtn, selectedApp === app.name && styles.appBtnSelected]}
                    onPress={() => handleOpenApp(app.deeplink, app.name)}
                  >
                    <ThemedText style={styles.appIcon}>
                      {app.name === "PhonePe" ? "📱" : app.name === "Google Pay" ? "🔵" : app.name === "Paytm" ? "💙" : "📲"}
                    </ThemedText>
                    <ThemedText style={styles.appName}>{app.name}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.instructionCard}>
                <ThemedText style={styles.instructionTitle}>📋 How to Pay</ThemedText>
                <ThemedText style={styles.instructionText}>1. Copy the UPI ID or tap an app button above</ThemedText>
                <ThemedText style={styles.instructionText}>2. Complete payment of ₹{paymentInfo.amount.toLocaleString()}</ThemedText>
                <ThemedText style={styles.instructionText}>3. Note your UTR/Reference ID from payment</ThemedText>
                <ThemedText style={styles.instructionText}>4. Come back and enter UTR below</ThemedText>
              </View>

              <Button onPress={() => setStep("utr")} style={styles.primaryButton}>
                I've Paid — Enter UTR ID
              </Button>
            </View>
          )}

          {/* Step 3: Enter UTR */}
          {step === "utr" && paymentInfo && (
            <View>
              <View style={styles.stepHeader}>
                <Pressable onPress={() => setStep("payment")} style={styles.backBtn}>
                  <Feather name="arrow-left" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
                <ThemedText style={styles.stepTitle}>Enter UTR ID</ThemedText>
              </View>

              {errorMsg ? <View style={styles.errorBanner}><ThemedText style={styles.errorText}>{errorMsg}</ThemedText></View> : null}

              <View style={styles.utrInfoCard}>
                <ThemedText style={styles.utrInfoText}>Amount: <ThemedText style={{ color: GameColors.green, fontWeight: "700" }}>₹{paymentInfo.amount.toLocaleString()}</ThemedText></ThemedText>
                <ThemedText style={styles.utrInfoText}>Payment ID: <ThemedText style={{ color: Colors.dark.textSecondary, fontSize: 11 }}>{paymentInfo.paymentId}</ThemedText></ThemedText>
              </View>

              <View style={styles.utrInputContainer}>
                <ThemedText style={styles.utrLabel}>UTR / Reference Number</ThemedText>
                <TextInput
                  style={styles.utrInput}
                  placeholder="Enter 12-digit UTR number"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={utrId}
                  onChangeText={setUtrId}
                  keyboardType="number-pad"
                  maxLength={20}
                />
                <ThemedText style={styles.utrHint}>
                  Find this in your UPI app's transaction history (Transaction ID / UTR No.)
                </ThemedText>
              </View>

              <Button
                onPress={handleSubmitUtr}
                disabled={isSubmittingDeposit || utrId.length < 6}
                style={styles.primaryButton}
              >
                {isSubmittingDeposit ? <ActivityIndicator color="#FFF" size="small" /> : "Submit for Verification"}
              </Button>
            </View>
          )}

          {/* Step 4: Success */}
          {step === "success" && (
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Feather name="check-circle" size={60} color={GameColors.green} />
              </View>
              <ThemedText style={styles.successTitle}>Request Submitted!</ThemedText>
              <ThemedText style={styles.successText}>
                Your deposit request has been submitted. Admin will verify your payment and credit your wallet within 24 hours.
              </ThemedText>
              <Button onPress={() => { resetFlow(); setActiveTab("history"); }} style={styles.primaryButton}>
                View Transaction History
              </Button>
              <Button onPress={resetFlow} style={[styles.primaryButton, { backgroundColor: Colors.dark.backgroundDefault, marginTop: 8 }]}>
                Add More Money
              </Button>
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[styles.transactionsList, { paddingBottom: insets.bottom + Spacing.xl }]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={40} color={Colors.dark.textMuted} />
              <ThemedText style={styles.emptyText}>No transactions yet</ThemedText>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  balanceCard: { backgroundColor: Colors.dark.backgroundDefault, marginHorizontal: Spacing.lg, borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: "center", marginBottom: Spacing.md },
  balanceLabel: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  tabs: { flexDirection: "row", marginHorizontal: Spacing.lg, backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: 4, marginBottom: Spacing.md },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg, alignItems: "center" },
  tabActive: { backgroundColor: Colors.dark.backgroundSecondary },
  tabText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "600" },
  tabTextActive: { color: "#FFF" },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  stepHeader: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.lg },
  backBtn: { padding: Spacing.sm, marginRight: Spacing.sm },
  stepTitle: { fontSize: 18, fontWeight: "700", color: "#FFF" },
  errorBanner: { backgroundColor: "rgba(248,81,73,0.1)", borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: "rgba(248,81,73,0.3)" },
  errorText: { color: GameColors.red, fontSize: 13 },
  amountInputContainer: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  currencySymbol: { fontSize: 24, fontWeight: "700", color: GameColors.coinGold, marginRight: Spacing.sm },
  amountInput: { flex: 1, height: 56, fontSize: 24, fontWeight: "600", color: Colors.dark.text },
  quickAmounts: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.lg },
  quickAmountButton: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.backgroundSecondary },
  quickAmountButtonActive: { backgroundColor: GameColors.green, borderColor: GameColors.green },
  quickAmountText: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary },
  quickAmountTextActive: { color: "#FFFFFF" },
  primaryButton: { backgroundColor: GameColors.green, marginBottom: Spacing.sm },
  minNote: { fontSize: 12, color: Colors.dark.textMuted, textAlign: "center", marginTop: Spacing.sm },
  upiCard: { backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.lg, alignItems: "center" },
  upiLabel: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  upiIdRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.sm },
  upiIdText: { fontSize: 18, fontWeight: "700", color: "#FFF", fontFamily: "monospace" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.dark.backgroundSecondary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  copyBtnSuccess: { backgroundColor: "rgba(46,160,67,0.2)" },
  copyBtnText: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "600" },
  upiName: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: Spacing.md },
  amountChip: { backgroundColor: "rgba(46,160,67,0.2)", paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  amountChipText: { fontSize: 20, fontWeight: "800", color: GameColors.green },
  sectionLabel: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary, marginBottom: Spacing.md },
  appRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.lg, flexWrap: "wrap" },
  appBtn: { flex: 1, minWidth: 70, backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: Spacing.md, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  appBtnSelected: { borderColor: GameColors.green, backgroundColor: "rgba(46,160,67,0.1)" },
  appIcon: { fontSize: 28, marginBottom: 4 },
  appName: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "600", textAlign: "center" },
  instructionCard: { backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  instructionTitle: { fontSize: 14, fontWeight: "700", color: "#FFF", marginBottom: Spacing.md },
  instructionText: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: 6, lineHeight: 20 },
  utrInfoCard: { backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  utrInfoText: { fontSize: 13, color: Colors.dark.textSecondary, marginBottom: 6 },
  utrInputContainer: { marginBottom: Spacing.lg },
  utrLabel: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary, marginBottom: Spacing.sm },
  utrInput: { backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: 18, fontWeight: "700", color: Colors.dark.text, borderWidth: 2, borderColor: Colors.dark.backgroundSecondary, letterSpacing: 2 },
  utrHint: { fontSize: 12, color: Colors.dark.textMuted, marginTop: Spacing.sm },
  successContainer: { alignItems: "center", paddingTop: Spacing["3xl"] },
  successIcon: { marginBottom: Spacing.xl },
  successTitle: { fontSize: 24, fontWeight: "800", color: "#FFF", marginBottom: Spacing.md },
  successText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  transactionsList: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  transactionItem: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.lg, padding: Spacing.lg },
  transactionIcon: { marginRight: Spacing.md },
  transactionDetails: { flex: 1 },
  transactionType: { fontSize: 14, fontWeight: "600" },
  transactionDate: { fontSize: 12, color: Colors.dark.textMuted },
  transactionUtr: { fontSize: 11, color: Colors.dark.textMuted, marginTop: 2, fontFamily: "monospace" },
  transactionRight: { alignItems: "flex-end", gap: 4 },
  transactionAmount: { fontSize: 16, fontWeight: "700" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: Spacing.md },
  emptyText: { color: Colors.dark.textMuted, fontSize: 14 },
});
