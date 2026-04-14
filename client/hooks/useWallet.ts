import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

export interface Transaction {
  id: number;
  type: string;
  amount: number;
  status: string;
  paymentId: string | null;
  utrId: string | null;
  upiApp: string | null;
  note: string | null;
  createdAt: string;
}

export interface UpiPaymentInfo {
  upiId: string;
  upiName: string;
  amount: number;
  paymentId: string;
  qrData: string;
  apps: { name: string; package: string; deeplink: string }[];
}

export function useWallet() {
  const queryClient = useQueryClient();

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/wallet/transactions"],
    staleTime: 10000,
  });

  const initiatePaymentMutation = useMutation({
    mutationFn: async (amount: number): Promise<UpiPaymentInfo> => {
      const res = await apiRequest("POST", "/api/wallet/add", { amount });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
  });

  const submitDepositMutation = useMutation({
    mutationFn: async (data: { amount: number; paymentId: string; utrId: string; upiApp?: string }) => {
      const res = await apiRequest("POST", "/api/wallet/submit-deposit", data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: {
      amount: number;
      upiId?: string;
      bankName?: string;
      ifscCode?: string;
      accountNumber?: string;
      accountHolderName?: string;
    }) => {
      const res = await apiRequest("POST", "/api/wallet/withdraw", data);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/transactions"] });
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  return {
    transactions: transactions ?? [],
    isLoadingTransactions,
    initiatePayment: initiatePaymentMutation.mutateAsync,
    isInitiatingPayment: initiatePaymentMutation.isPending,
    submitDeposit: submitDepositMutation.mutateAsync,
    isSubmittingDeposit: submitDepositMutation.isPending,
    submitDepositError: submitDepositMutation.error,
    withdraw: withdrawMutation.mutateAsync,
    isWithdrawing: withdrawMutation.isPending,
    withdrawError: withdrawMutation.error,
  };
}
