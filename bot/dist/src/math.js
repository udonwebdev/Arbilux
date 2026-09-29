/**
 * Analytical closed-form calculus engine for 2-hop / 3-hop arbitrage sizing.
 * Incorporates dynamic lender premium (0 bps for Balancer V2, 5 bps for Aave V3).
 */
export function calculateMultiLenderSizing(r1a, // Venue 1 In-token Reserve
r1b, // Venue 1 Out-token Reserve
r2b, // Venue 2 In-token Reserve
r2a, // Venue 2 Out-token Reserve
pool1FeeBps = 5, // UniV3 500 = 5 bps
pool2FeeBps = 30, // Sushi/Camelot ~30 bps
gasCostWei = 500000000000000n // ~0.0005 ETH execution cost buffer
) {
    // Test Balancer V2 first (0 bps flash loan fee)
    const balancerOpt = solveOptimalBorrow(r1a, r1b, r2b, r2a, pool1FeeBps, pool2FeeBps, 0);
    if (balancerOpt > 0n) {
        const gross = estimateOutputDelta(balancerOpt, r1a, r1b, r2b, r2a, pool1FeeBps, pool2FeeBps);
        if (gross > gasCostWei) {
            return {
                optimalInput: balancerOpt,
                projectedGrossProfit: gross,
                projectedNetProfit: gross - gasCostWei,
                recommendedLender: 'BALANCER'
            };
        }
    }
    // Fallback to Aave V3 (5 bps flash loan fee)
    const aaveOpt = solveOptimalBorrow(r1a, r1b, r2b, r2a, pool1FeeBps, pool2FeeBps, 5);
    if (aaveOpt > 0n) {
        const gross = estimateOutputDelta(aaveOpt, r1a, r1b, r2b, r2a, pool1FeeBps, pool2FeeBps);
        const aavePremium = (aaveOpt * 5n) / 10000n;
        const totalDeductions = aavePremium + gasCostWei;
        if (gross > totalDeductions) {
            return {
                optimalInput: aaveOpt,
                projectedGrossProfit: gross,
                projectedNetProfit: gross - totalDeductions,
                recommendedLender: 'AAVE'
            };
        }
    }
    return {
        optimalInput: 0n,
        projectedGrossProfit: 0n,
        projectedNetProfit: 0n,
        recommendedLender: 'BALANCER'
    };
}
export function solveOptimalBorrow(r1a, r1b, r2b, r2a, fee1Bps, fee2Bps, flashFeeBps) {
    const gamma1 = BigInt(10000 - fee1Bps);
    const gamma2 = BigInt(10000 - fee2Bps);
    const gammaFlash = BigInt(10000 - flashFeeBps);
    const numeratorTerm1 = r1a * r2a * r1b * r2b * gamma1 * gamma2;
    const sqrtVal = sqrtBigInt(numeratorTerm1);
    const numeratorTerm2 = (r1a * r2b * 10000n * 10000n) / gammaFlash;
    if (sqrtVal <= numeratorTerm2)
        return 0n;
    const numerator = sqrtVal - numeratorTerm2;
    const denominator = (gamma1 * r2b) + ((gamma1 * gamma2 * r1b) / 10000n);
    if (denominator === 0n)
        return 0n;
    return (numerator * 10000n) / (denominator * gammaFlash);
}
export function estimateOutputDelta(amountIn, r1a, r1b, r2b, r2a, fee1Bps, fee2Bps) {
    // Constant product simulation across Leg 1 and Leg 2
    const amountInWithFee1 = amountIn * BigInt(10000 - fee1Bps);
    const amountIntermediate = (amountInWithFee1 * r1b) / ((r1a * 10000n) + amountInWithFee1);
    const amountInWithFee2 = amountIntermediate * BigInt(10000 - fee2Bps);
    const amountFinal = (amountInWithFee2 * r2a) / ((r2b * 10000n) + amountInWithFee2);
    return amountFinal > amountIn ? amountFinal - amountIn : 0n;
}
export function calculateOptimalInput(r1a, r1b, r2b, r2a, fee1Bps = 5, fee2Bps = 30) {
    return solveOptimalBorrow(r1a, r1b, r2b, r2a, fee1Bps, fee2Bps, 0);
}
export function sqrtBigInt(value) {
    if (value < 0n)
        throw new Error('Square root of negative number');
    if (value < 2n)
        return value;
    let x0 = value / 2n;
    let x1 = (x0 + value / x0) / 2n;
    while (x1 < x0) {
        x0 = x1;
        x1 = (x0 + value / x0) / 2n;
    }
    return x0;
}
