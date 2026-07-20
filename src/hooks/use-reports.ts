import { useQuery } from "@tanstack/react-query";
import {
  getBestSellers,
  getCollectedByDay,
  getDashboardStats,
  getOutstandingBalances,
  getPendingPayments,
  getReportOverview,
  getRevenueByDay,
  getTaxInRange,
  getDueRecalls,
} from "@/db/reports";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => getDashboardStats(),
  });
}

export function useRevenueByDay(days = 14) {
  return useQuery({
    queryKey: ["dashboard", "revenue", days],
    queryFn: () => getRevenueByDay(days),
  });
}

export function usePendingPayments(limit = 6) {
  return useQuery({
    queryKey: ["dashboard", "pending", limit],
    queryFn: () => getPendingPayments(limit),
  });
}

export function useOutstandingBalances() {
  return useQuery({
    queryKey: ["reports", "outstanding"],
    queryFn: () => getOutstandingBalances(),
  });
}

export function useReportOverview(from: string, to: string) {
  return useQuery({
    queryKey: ["reports", "overview", from, to],
    queryFn: () => getReportOverview(from, to),
  });
}

export function useCollectedByDay(from: string, to: string) {
  return useQuery({
    queryKey: ["reports", "collected-by-day", from, to],
    queryFn: () => getCollectedByDay(from, to),
  });
}

export function useBestSellers(from: string, to: string, limit = 10) {
  return useQuery({
    queryKey: ["reports", "best-sellers", from, to, limit],
    queryFn: () => getBestSellers(from, to, limit),
  });
}

export function useTaxInRange(from: string, to: string) {
  return useQuery({
    queryKey: ["reports", "tax-range", from, to],
    queryFn: () => getTaxInRange(from, to),
  });
}

export function useDueRecalls(months: number) {
  return useQuery({
    queryKey: ["dashboard", "recalls", months],
    queryFn: () => getDueRecalls(months),
  });
}
