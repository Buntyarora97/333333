import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { Colors, Spacing, BorderRadius, GameColors } from "@/constants/theme";

type WithdrawMethod = "upi" | "bank";

export default function WithdrawalScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user, refreshUser } = useAuth();
  const { withdraw, isWithdrawing } = useWallet();

  const [method, setMethod] = useState<WithdrawMethod>("upi");
  const [amount, setAmount] = useState("");

  // UPI fields
  const [upiId, setUpiId] = useState("");

  // Bank fields
  const [bankName, setBankName] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleWithdraw = async () => {
    setError("");
    setSuccess("");

    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount < 100) {
      setError("Minimum withdrawal is ₹100");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (numAmount > (user?.balance ?? 0)) {
      setError("Insufficient balance");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (method === "upi") {
      if (!upiId.trim() || !upiId.includes("@")) {
        setError("Please enter a valid UPI ID (e.g. name@upi)");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    } else {
      if (!bankName || !ifscCode || !accountNumber || !accountHolderName) {
        setError("Please fill all bank details");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      if (accountNumber !== confirmAccountNumber) {
        setError("Account numbers do not match");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    }

    try {
      if (method === "upi") {
        await withdraw({ amount: numAmount, upiId: upiId.trim() });
      } else {
        await withdraw({ amount: numAmount, bankName, ifscCode, accountNumber, accountHolderName });
      }
      await refreshUser();
      setSuccess("Withdrawal request submitted! Processing within 24 hours.");
      setAmount("");
      setUpiId("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Withdrawal failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={styles.balanceCard}>
        <ThemedText style={styles.balanceLabel}>Available Balance</ThemedText>
        <ThemedText style={styles.balanceAmount}>₹{(user?.balance ?? 0).toLocaleString()}</ThemedText>
      </View>

      <View style={styles.form}>
        <ThemedText style={styles.sectionTitle}>Withdrawal Amount</ThemedText>
        <View style={styles.amountRow}>
          <ThemedText style={styles.currencyPrefix}>₹</ThemedText>
          <TextInput
            style={styles.amountInput}
            placeholder="Min ₹100"
            placeholderTextColor={Colors.dark.textMuted}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
          />
        </View>
        <ThemedText style={styles.minNote}>Minimum withdrawal: ₹100</ThemedText>

        {/* Method Toggle */}
        <ThemedText style={styles.sectionTitle}>Withdrawal Method</ThemedText>
        <View style={styles.methodToggle}>
          <Pressable
            style={[styles.methodBtn, method === "upi" && styles.methodBtnActive]}
            onPress={() => { setMethod("upi"); setError(""); }}
          >
            <Feather name="smartphone" size={16} color={method === "upi" ? "#FFF" : Colors.dark.textSecondary} />
            <ThemedText style={[styles.methodBtnText, method === "upi" && styles.methodBtnTextActive]}>
              UPI
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.methodBtn, method === "bank" && styles.methodBtnActive]}
            onPress={() => { setMethod("bank"); setError(""); }}
          >
            <Feather name="credit-card" size={16} color={method === "bank" ? "#FFF" : Colors.dark.textSecondary} />
            <ThemedText style={[styles.methodBtnText, method === "bank" && styles.methodBtnTextActive]}>
              Bank Transfer
            </ThemedText>
          </Pressable>
        </View>

        {/* UPI Fields */}
        {method === "upi" && (
          <View style={styles.fieldGroup}>
            <ThemedText style={styles.fieldLabel}>UPI ID</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="yourname@paytm / @gpay / @upi"
              placeholderTextColor={Colors.dark.textMuted}
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <ThemedText style={styles.fieldHint}>
              Your UPI ID from PhonePe, Google Pay, Paytm, or any other UPI app
            </ThemedText>
          </View>
        )}

        {/* Bank Fields */}
        {method === "bank" && (
          <View style={styles.fieldGroup}>
            <TextInput
              style={styles.input}
              placeholder="Account Holder Name"
              placeholderTextColor={Colors.dark.textMuted}
              value={accountHolderName}
              onChangeText={setAccountHolderName}
            />
            <TextInput
              style={styles.input}
              placeholder="Bank Name"
              placeholderTextColor={Colors.dark.textMuted}
              value={bankName}
              onChangeText={setBankName}
            />
            <TextInput
              style={styles.input}
              placeholder="IFSC Code"
              placeholderTextColor={Colors.dark.textMuted}
              value={ifscCode}
              onChangeText={setIfscCode}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder="Account Number"
              placeholderTextColor={Colors.dark.textMuted}
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="number-pad"
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Account Number"
              placeholderTextColor={Colors.dark.textMuted}
              value={confirmAccountNumber}
              onChangeText={setConfirmAccountNumber}
              keyboardType="number-pad"
            />
          </View>
        )}

        {error ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={GameColors.red} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        {success ? (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={14} color={GameColors.green} />
            <ThemedText style={styles.successText}>{success}</ThemedText>
          </View>
        ) : null}

        <Button
          onPress={handleWithdraw}
          disabled={isWithdrawing || !amount}
          style={styles.withdrawButton}
        >
          {isWithdrawing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            "Request Withdrawal"
          )}
        </Button>

        <View style={styles.infoCard}>
          <Feather name="info" size={14} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.infoText}>
            Withdrawals are processed within 24 hours. Make sure your details are correct.
          </ThemedText>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  balanceCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  balanceLabel: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: "800",
    color: GameColors.coinGold,
  },
  form: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  currencyPrefix: {
    fontSize: 22,
    fontWeight: "700",
    color: GameColors.coinGold,
    marginRight: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    height: 56,
    fontSize: 22,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  minNote: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: -Spacing.xs,
  },
  methodToggle: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: 4,
  },
  methodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  methodBtnActive: {
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  methodBtnText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "600",
  },
  methodBtnTextActive: {
    color: "#FFF",
  },
  fieldGroup: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  fieldHint: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    lineHeight: 16,
  },
  input: {
    height: 52,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.backgroundSecondary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(248,81,73,0.1)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(248,81,73,0.3)",
  },
  errorText: {
    color: GameColors.red,
    fontSize: 13,
    flex: 1,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(46,160,67,0.1)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(46,160,67,0.3)",
  },
  successText: {
    color: GameColors.green,
    fontSize: 13,
    flex: 1,
  },
  withdrawButton: {
    marginTop: Spacing.sm,
    backgroundColor: GameColors.green,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  infoText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 18,
  },
});
