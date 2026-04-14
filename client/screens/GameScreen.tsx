import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { TrafficLight } from "@/components/TrafficLight";
import { CoinDisplay } from "@/components/CoinDisplay";
import { BetControls } from "@/components/BetControls";
import { ColorBetButton } from "@/components/ColorBetButton";
import { CountdownTimer } from "@/components/CountdownTimer";
import { useAuth } from "@/hooks/useAuth";
import { useGameState } from "@/hooks/useGameState";
import { Colors, Spacing, BorderRadius, GameColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const COLORS = ["red", "yellow", "green"] as const;
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { user, refreshUser } = useAuth();
  const { gameState, isLoading, placeBet, isBetting } = useGameState();

  const [betMode, setBetMode] = useState<"color" | "number">("color");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState(100);
  const [betPlaced, setBetPlaced] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);

  React.useEffect(() => {
    if (gameState?.phase === "betting" && betPlaced) {
      // Don't reset on the same betting phase
    }
    if (gameState?.phase === "waiting") {
      setBetPlaced(false);
      setSelectedColor(null);
      setSelectedNumber(null);
      setBetError(null);
    }
  }, [gameState?.phase]);

  const handleColorSelect = useCallback((color: string) => {
    if (gameState?.phase !== "betting" || betPlaced) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedColor((prev) => (prev === color ? null : color));
  }, [gameState?.phase, betPlaced]);

  const handleNumberSelect = useCallback((num: number) => {
    if (gameState?.phase !== "betting" || betPlaced) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedNumber((prev) => (prev === num ? null : num));
  }, [gameState?.phase, betPlaced]);

  const handlePlaceBet = async () => {
    setBetError(null);
    if (gameState?.phase !== "betting") return;
    if (!user || user.balance < betAmount) {
      Alert.alert("Insufficient Balance", "Please add money to your wallet first.");
      return;
    }

    const hasSelection = betMode === "color" ? !!selectedColor : selectedNumber !== null;
    if (!hasSelection) {
      Alert.alert("Select", betMode === "color" ? "Please select a color" : "Please select a number");
      return;
    }

    try {
      if (betMode === "color") {
        await placeBet("color", selectedColor!, betAmount);
      } else {
        await placeBet("number", selectedNumber!, betAmount);
      }
      setBetPlaced(true);
      await refreshUser();
    } catch (e: any) {
      setBetError(e.message || "Bet failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const adjustBet = (delta: number) => {
    setBetAmount((prev) => {
      const newAmount = Math.max(10, Math.min(prev + delta, Math.min(100000, user?.balance ?? 0)));
      if (newAmount !== prev) Haptics.selectionAsync();
      return newAmount;
    });
  };

  const getColorForResult = (color: string) => {
    switch (color) {
      case "red": return GameColors.red;
      case "yellow": return GameColors.yellow;
      case "green": return GameColors.green;
      default: return Colors.dark.textMuted;
    }
  };

  const formatCountdown = (secs: number) => {
    if (secs <= 0) return "00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (isLoading || !gameState) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const isWaiting = gameState.phase === "waiting";
  const isBettingOpen = gameState.phase === "betting";
  const isResult = gameState.phase === "result";

  const currentSelection = betMode === "color" ? selectedColor : selectedNumber?.toString();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={() => navigation.navigate("Settings")}>
          <Feather name="menu" size={24} color="#FFF" />
        </Pressable>
        <Image source={require("../../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
        <CoinDisplay balance={user?.balance ?? 0} compact />
      </View>

      <View style={styles.walletBar}>
        <Pressable style={styles.walletButton} onPress={() => navigation.navigate("Wallet")}>
          <Feather name="plus-circle" size={18} color={GameColors.coinGold} />
          <ThemedText style={styles.walletButtonText}>Add Money</ThemedText>
        </Pressable>
        <View style={styles.walletDivider} />
        <Pressable style={styles.walletButton} onPress={() => navigation.navigate("History")}>
          <Feather name="clock" size={18} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.walletButtonText}>History</ThemedText>
        </Pressable>
        <View style={styles.walletDivider} />
        <Pressable style={styles.walletButton} onPress={() => navigation.navigate("Leaderboard")}>
          <Feather name="award" size={18} color={GameColors.yellow} />
          <ThemedText style={styles.walletButtonText}>Rank</ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Game Schedule */}
        <View style={styles.scheduleRow}>
          {["09:00 AM", "01:00 PM", "05:00 PM", "09:00 PM"].map((t) => (
            <View key={t} style={[styles.scheduleChip, gameState.nextScheduledTime === t && styles.scheduleChipActive]}>
              <ThemedText style={[styles.scheduleChipText, gameState.nextScheduledTime === t && styles.scheduleChipTextActive]}>
                {t}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Phase Banner */}
        {isWaiting && (
          <View style={styles.waitingBanner}>
            <Feather name="clock" size={20} color={GameColors.yellow} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.waitingTitle}>Next Game: {gameState.nextScheduledTime || "—"}</ThemedText>
              <ThemedText style={styles.waitingCountdown}>{formatCountdown(gameState.countdown)}</ThemedText>
            </View>
          </View>
        )}

        {isBettingOpen && (
          <View style={[styles.phaseBanner, { backgroundColor: "rgba(46,160,67,0.15)", borderColor: GameColors.green }]}>
            <View style={[styles.phaseDot, { backgroundColor: GameColors.green }]} />
            <ThemedText style={[styles.phaseText, { color: GameColors.green }]}>
              🎯 BETTING OPEN — {gameState.nextScheduledTime}
            </ThemedText>
          </View>
        )}

        {isResult && (
          <View style={[styles.phaseBanner, { backgroundColor: "rgba(56,139,253,0.15)", borderColor: "#388bfd" }]}>
            <View style={[styles.phaseDot, { backgroundColor: "#388bfd" }]} />
            <ThemedText style={[styles.phaseText, { color: "#388bfd" }]}>
              🎲 Result in {gameState.countdown}s
            </ThemedText>
          </View>
        )}

        {/* Traffic Lights */}
        <View style={styles.trafficLightsSection}>
          <View style={styles.trafficLightsRow}>
            {COLORS.map((color) => (
              <TrafficLight
                key={color}
                color={color}
                isActive={isResult}
                isSelected={betMode === "color" && selectedColor === color}
                isResult={isResult && gameState.lastResult === color}
                onPress={() => { setBetMode("color"); handleColorSelect(color); }}
                disabled={!isBettingOpen || betPlaced}
                size={75}
              />
            ))}
          </View>
          {isResult && gameState.lastResult && (
            <View style={styles.resultBadge}>
              <View style={[styles.resultDot, { backgroundColor: getColorForResult(gameState.lastResult) }]} />
              <ThemedText style={styles.resultText}>
                {gameState.lastResult.toUpperCase()} — #{gameState.lastResultNumber ?? "?"}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Timer */}
        <View style={styles.timerSection}>
          {isBettingOpen && (
            <CountdownTimer countdown={gameState.countdown} phase={gameState.phase} />
          )}
          {betPlaced && isBettingOpen && (
            <View style={styles.betPlacedBadge}>
              <Feather name="check-circle" size={16} color={GameColors.green} />
              <ThemedText style={styles.betPlacedText}>
                Bet placed! Waiting for result...
              </ThemedText>
            </View>
          )}
          {betError && (
            <View style={styles.errorBadge}>
              <Feather name="alert-circle" size={14} color={GameColors.red} />
              <ThemedText style={styles.errorText}>{betError}</ThemedText>
            </View>
          )}
        </View>

        {/* Betting Section */}
        {isBettingOpen && !betPlaced && (
          <View style={styles.bettingSection}>
            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <Pressable
                style={[styles.modeBtn, betMode === "color" && styles.modeBtnActive]}
                onPress={() => { setBetMode("color"); setSelectedNumber(null); }}
              >
                <ThemedText style={[styles.modeBtnText, betMode === "color" && styles.modeBtnTextActive]}>
                  🎨 Color Bet (2x)
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, betMode === "number" && styles.modeBtnActive]}
                onPress={() => { setBetMode("number"); setSelectedColor(null); }}
              >
                <ThemedText style={[styles.modeBtnText, betMode === "number" && styles.modeBtnTextActive]}>
                  🔢 Number Bet (9x)
                </ThemedText>
              </Pressable>
            </View>

            <BetControls
              currentBet={betAmount}
              maxBet={user?.balance ?? 0}
              onAdjust={adjustBet}
              disabled={false}
            />

            {/* Color Buttons */}
            {betMode === "color" && (
              <View style={styles.betButtonsRow}>
                {COLORS.map((color) => (
                  <ColorBetButton
                    key={color}
                    color={color}
                    isSelected={selectedColor === color}
                    onPress={() => handleColorSelect(color)}
                    disabled={false}
                  />
                ))}
              </View>
            )}

            {/* Number Buttons */}
            {betMode === "number" && (
              <View style={styles.numberGrid}>
                {NUMBERS.map((num) => (
                  <Pressable
                    key={num}
                    style={[styles.numBtn, selectedNumber === num && styles.numBtnSelected]}
                    onPress={() => handleNumberSelect(num)}
                  >
                    <ThemedText style={[styles.numBtnText, selectedNumber === num && styles.numBtnTextSelected]}>
                      {num}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Place Bet Button */}
            {((betMode === "color" && selectedColor) || (betMode === "number" && selectedNumber !== null)) && (
              <Pressable
                style={[styles.placeBetButton, isBetting && styles.placeBetButtonDisabled]}
                onPress={handlePlaceBet}
                disabled={isBetting}
              >
                {isBetting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <ThemedText style={styles.placeBetButtonText}>
                    Place ₹{betAmount.toLocaleString()} on{" "}
                    {betMode === "color" ? selectedColor?.toUpperCase() : `Number ${selectedNumber}`}
                    {betMode === "number" ? "  (Win 9x)" : "  (Win 2x)"}
                  </ThemedText>
                )}
              </Pressable>
            )}
          </View>
        )}

        {/* Result History Table */}
        <View style={styles.historySection}>
          <ThemedText style={styles.historySectionTitle}>Result History</ThemedText>
          <View style={styles.tableHeader}>
            <ThemedText style={[styles.tableHeaderText, { flex: 0.6 }]}>Color</ThemedText>
            <ThemedText style={[styles.tableHeaderText, { flex: 0.4 }]}>No.</ThemedText>
            <ThemedText style={[styles.tableHeaderText, { flex: 1 }]}>Time Slot</ThemedText>
            <ThemedText style={[styles.tableHeaderText, { flex: 1.2 }]}>Date</ThemedText>
          </View>
          {gameState.history.slice(0, 15).map((round) => (
            <View key={round.id} style={styles.tableRow}>
              <View style={{ flex: 0.6, alignItems: "center" }}>
                <View style={[styles.colorCell, { backgroundColor: getColorForResult(round.resultColor) }]}>
                  <ThemedText style={styles.colorCellText}>
                    {round.resultColor.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.tableCellText, { flex: 0.4, color: "#388bfd", fontWeight: "700" }]}>
                {round.resultNumber ?? "?"}
              </ThemedText>
              <ThemedText style={[styles.tableCellText, { flex: 1, fontSize: 11 }]}>
                {round.scheduledTime || "—"}
              </ThemedText>
              <ThemedText style={[styles.tableCellText, { flex: 1.2, fontSize: 11 }]}>
                {new Date(round.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </ThemedText>
            </View>
          ))}
          {gameState.history.length === 0 && (
            <ThemedText style={styles.noHistoryText}>No rounds played yet</ThemedText>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  menuButton: { padding: Spacing.sm },
  logo: { width: 100, height: 40 },
  walletBar: { flexDirection: "row", backgroundColor: Colors.dark.backgroundDefault, marginHorizontal: Spacing.lg, borderRadius: BorderRadius.xl, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, alignItems: "center", justifyContent: "space-around" },
  walletButton: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  walletButtonText: { fontSize: 13, color: Colors.dark.textSecondary },
  walletDivider: { width: 1, height: 20, backgroundColor: Colors.dark.backgroundSecondary },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  scheduleRow: { flexDirection: "row", gap: Spacing.xs, marginBottom: Spacing.md, justifyContent: "center", flexWrap: "wrap" },
  scheduleChip: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.backgroundSecondary },
  scheduleChipActive: { backgroundColor: "rgba(210,153,34,0.2)", borderColor: GameColors.yellow },
  scheduleChipText: { fontSize: 11, color: Colors.dark.textMuted, fontWeight: "600" },
  scheduleChipTextActive: { color: GameColors.yellow },
  waitingBanner: { flexDirection: "row", alignItems: "center", gap: Spacing.md, backgroundColor: "rgba(210,153,34,0.1)", borderRadius: BorderRadius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: "rgba(210,153,34,0.3)", marginBottom: Spacing.md },
  waitingTitle: { fontSize: 14, color: GameColors.yellow, fontWeight: "600" },
  waitingCountdown: { fontSize: 28, fontWeight: "800", color: "#FFF", fontVariant: ["tabular-nums"] },
  phaseBanner: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderWidth: 1, marginBottom: Spacing.md },
  phaseDot: { width: 8, height: 8, borderRadius: 4 },
  phaseText: { fontSize: 14, fontWeight: "700" },
  trafficLightsSection: { alignItems: "center", paddingVertical: Spacing.xl },
  trafficLightsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: Spacing["3xl"] },
  resultBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.md, backgroundColor: Colors.dark.backgroundDefault, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  resultDot: { width: 12, height: 12, borderRadius: 6 },
  resultText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  timerSection: { alignItems: "center", marginBottom: Spacing.md },
  betPlacedBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: "rgba(52,199,89,0.2)", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.sm },
  betPlacedText: { fontSize: 14, color: GameColors.green, fontWeight: "600" },
  errorBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: "rgba(248,81,73,0.15)", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.sm },
  errorText: { fontSize: 13, color: GameColors.red },
  bettingSection: { gap: Spacing.md, marginBottom: Spacing.xl },
  modeToggle: { flexDirection: "row", backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: 4 },
  modeBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg, alignItems: "center" },
  modeBtnActive: { backgroundColor: Colors.dark.backgroundSecondary },
  modeBtnText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "600" },
  modeBtnTextActive: { color: "#FFF" },
  betButtonsRow: { flexDirection: "row", gap: Spacing.md },
  numberGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, justifyContent: "center" },
  numBtn: { width: 52, height: 52, borderRadius: BorderRadius.lg, backgroundColor: Colors.dark.backgroundDefault, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.dark.backgroundSecondary },
  numBtnSelected: { backgroundColor: "rgba(56,139,253,0.2)", borderColor: "#388bfd" },
  numBtnText: { fontSize: 18, fontWeight: "700", color: Colors.dark.textSecondary },
  numBtnTextSelected: { color: "#388bfd" },
  placeBetButton: { backgroundColor: GameColors.green, paddingVertical: Spacing.lg, borderRadius: BorderRadius.xl, alignItems: "center", justifyContent: "center" },
  placeBetButtonDisabled: { opacity: 0.6 },
  placeBetButtonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  historySection: { backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  historySectionTitle: { fontSize: 16, color: "#FFF", marginBottom: Spacing.md, fontWeight: "700", textAlign: "center" },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)", paddingBottom: Spacing.xs, marginBottom: Spacing.xs },
  tableHeaderText: { fontSize: 12, fontWeight: "700", color: Colors.dark.textSecondary, textAlign: "center" },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  tableCellText: { fontSize: 12, color: "#FFF", textAlign: "center" },
  colorCell: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  colorCellText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  noHistoryText: { fontSize: 12, color: Colors.dark.textMuted, textAlign: "center", paddingVertical: Spacing.md },
});
