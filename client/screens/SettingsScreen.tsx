import React from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { CoinDisplay } from "@/components/CoinDisplay";
import { Button } from "@/components/Button";
import { useAuth } from "@/hooks/useAuth";
import { Colors, Spacing, BorderRadius, GameColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const { user, logout, isAdmin } = useAuth();

  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
  };

  const MenuItem = ({
    icon,
    label,
    onPress,
    color,
  }: {
    icon: string;
    label: string;
    onPress: () => void;
    color?: string;
  }) => (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Feather name={icon as any} size={22} color={color || Colors.dark.textSecondary} />
      <ThemedText style={[styles.menuLabel, color && { color }]}>{label}</ThemedText>
      <Feather name="chevron-right" size={20} color={Colors.dark.textMuted} />
    </Pressable>
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
    >
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.avatar}
            resizeMode="contain"
          />
        </View>
        <ThemedText style={styles.username}>{user?.username ?? "Guest"}</ThemedText>
        <ThemedText style={styles.phone}>{user?.phone ?? ""}</ThemedText>
        {isAdmin && (
          <View style={styles.adminBadge}>
            <Feather name="shield" size={14} color={GameColors.yellow} />
            <ThemedText style={styles.adminText}>Admin</ThemedText>
          </View>
        )}
        <CoinDisplay balance={user?.balance ?? 0} />
      </View>

      <View style={styles.menuSection}>
        <MenuItem
          icon="plus-circle"
          label="Add Money"
          onPress={() => navigation.navigate("Wallet")}
        />
        <MenuItem
          icon="clock"
          label="Bet History"
          onPress={() => navigation.navigate("History")}
        />
        <MenuItem
          icon="award"
          label="Leaderboard"
          onPress={() => navigation.navigate("Leaderboard")}
        />
        <MenuItem
          icon="share-2"
          label="Refer & Earn"
          onPress={() => {
            alert(`Your Referral Code: ${user?.referralCode}\nShare this with friends to earn commission!`);
          }}
        />
        <MenuItem
          icon="arrow-up-circle"
          label="Withdraw Money"
          onPress={() => navigation.navigate("Withdrawal" as any)}
          color={GameColors.green}
        />
        {isAdmin && (
          <MenuItem
            icon="settings"
            label="Admin Panel"
            onPress={() => navigation.navigate("Admin")}
            color={GameColors.yellow}
          />
        )}
      </View>

      {/* Referral Banner */}
      {user?.referralCode && (
        <View style={styles.referralCard}>
          <View style={styles.referralRow}>
            <Feather name="share-2" size={16} color={GameColors.yellow} />
            <ThemedText style={styles.referralTitle}>Your Referral Code</ThemedText>
          </View>
          <ThemedText style={styles.referralCode}>{user.referralCode}</ThemedText>
          <ThemedText style={styles.referralInfo}>
            Earn 5% commission on every bet your friends place. L2 earns 2.5%.
          </ThemedText>
        </View>
      )}

      <View style={styles.infoSection}>
        <ThemedText style={styles.infoTitle}>How to Play</ThemedText>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="clock" size={16} color={GameColors.yellow} />
            <ThemedText style={styles.infoText}>
              4 games daily: 9AM, 1PM, 5PM, 9PM IST
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <Feather name="circle" size={16} color={GameColors.red} />
            <ThemedText style={styles.infoText}>
              Color Bet (Red/Yellow/Green) — Win 2x
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <Feather name="hash" size={16} color="#388bfd" />
            <ThemedText style={styles.infoText}>
              Number Bet (0–9) — Win 9x your stake
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <Feather name="info" size={16} color={Colors.dark.textMuted} />
            <ThemedText style={styles.infoText}>
              18% GST deducted on winnings only
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button onPress={handleLogout} style={styles.logoutButton}>
          Logout
        </Button>
        <ThemedText style={styles.disclaimer}>
          This is a demo game with virtual coins only.
          No real money is involved.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingHorizontal: Spacing.lg,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  username: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  phone: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.sm,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255, 204, 0, 0.2)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  adminText: {
    fontSize: 12,
    fontWeight: "600",
    color: GameColors.yellow,
  },
  menuSection: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.xl,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.backgroundSecondary,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    marginLeft: Spacing.lg,
  },
  infoSection: {
    marginBottom: Spacing.xl,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  infoCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  infoText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
    gap: Spacing.md,
  },
  logoutButton: {
    width: "100%",
    backgroundColor: Colors.dark.error,
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  referralCard: {
    backgroundColor: "rgba(210,153,34,0.1)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(210,153,34,0.3)",
  },
  referralRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  referralTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: GameColors.yellow,
  },
  referralCode: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 3,
    marginBottom: Spacing.xs,
    fontFamily: "monospace",
  },
  referralInfo: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    lineHeight: 18,
  },
});
