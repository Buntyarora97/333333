import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

interface GameRoundHistory {
  id: number;
  roundNumber: number;
  resultColor: string;
  resultNumber: number;
  scheduledTime: string | null;
  createdAt: string;
}

interface GameState {
  currentRound: number;
  phase: "waiting" | "betting" | "result";
  countdown: number;
  lastResult: string | null;
  lastResultNumber: number | null;
  nextScheduledTime: string | null;
  history: GameRoundHistory[];
}

export function useGameState() {
  const queryClient = useQueryClient();

  const { data: gameState, isLoading } = useQuery<GameState>({
    queryKey: ["/api/game/state"],
    refetchInterval: 2000,
    staleTime: 500,
  });

  const placeBetMutation = useMutation({
    mutationFn: async (data: {
      betType: "color" | "number";
      betColor?: string;
      betNumber?: number;
      betAmount: number;
    }) => {
      const res = await apiRequest("POST", "/api/game/bet", data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bet failed");
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/bets"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const placeBet = async (
    betType: "color" | "number",
    betColorOrNumber: string | number,
    betAmount: number
  ) => {
    if (betType === "color") {
      return placeBetMutation.mutateAsync({ betType, betColor: betColorOrNumber as string, betAmount });
    } else {
      return placeBetMutation.mutateAsync({ betType, betNumber: betColorOrNumber as number, betAmount });
    }
  };

  return {
    gameState: gameState ?? null,
    isLoading,
    placeBet,
    isBetting: placeBetMutation.isPending,
    betError: placeBetMutation.error,
  };
}

export function useUserBets() {
  const { data: bets, isLoading } = useQuery<any[]>({
    queryKey: ["/api/user/bets"],
    staleTime: 5000,
  });
  return { bets: bets ?? [], isLoading };
}

export function useLeaderboard() {
  const { data: leaderboard, isLoading } = useQuery<any[]>({
    queryKey: ["/api/leaderboard"],
    staleTime: 30000,
  });
  return { leaderboard: leaderboard ?? [], isLoading };
}
