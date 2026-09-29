/**
 * Calculates builder tip based on projected net edge.
 * Formula: Bribe = max(BasePriorityFee, ProjectedProfit * BribeRatio)
 * Standard competitive ratio on Arbitrum L2 private relays is 10% - 25% of gross profit.
 */
export function calculateBuilderBribe(projectedProfitWei, bribeShareBps = 1500n // 15.00%
) {
    if (projectedProfitWei <= 0n)
        return 0n;
    const dynamicBribe = (projectedProfitWei * bribeShareBps) / 10000n;
    const minFloorGasTip = 10000000n; // 0.01 Gwei minimum priority floor
    return dynamicBribe > minFloorGasTip ? dynamicBribe : minFloorGasTip;
}
