# Arbilux Quant Systems — Master Operating Directive & Architecture Specification

## 1. Company Vision & Operational Mission
**Arbilux** is an autonomous quantitative decentralized finance (DeFi) trading and technology firm.

### Mission
To engineer zero-capital, non-custodial, and deterministic arbitrage infrastructure across Layer 2 EVM networks (specifically Arbitrum One and Base). Arbilux operates by capturing mathematical inefficiencies and price dislocations across automated market maker (AMM) liquidity pools using atomic flash loans, zero-leakage smart contracts, and off-chain mempool-defense systems.

### Core Business Model
1. **Capital Source:** Uncollateralized flash liquidity borrowed from Balancer V2 (0% fee) and Aave V3 (0.05% protocol fee).
2. **Target Inefficiencies:** Cross-pool price divergences between Uniswap V3, Camelot, and SushiSwap across 50 vetted liquidity pairs.
3. **Execution Guardrail:** Strict atomicity. Transactions execute and settle within a single transaction block. If the net PnL after loan debt, protocol premiums, exchange fees, and gas costs is less than the predetermined threshold, the execution reverts completely.
4. **Mempool Defense:** Private bundle submissions directly to block builders (Flashbots, Titan, BeaverBuild) to eliminate front-running and eliminate reverted gas costs.

---

## 2. System Architecture & Component Breakdown

The Arbilux engine operates as a tightly coupled, 3-tier reactive pipeline:

```
┌────────────────────────────────────────────────────────┐
│             TIER 1: Ingestion & State Mirror           │
│  - WebSocket connections to Arbitrum L2 RPC/Sequencer  │
│  - Zero-RPC in-memory reserve mirror (50 target pairs) │
│  - Constant-product & tick-math cycle detector         │
└──────────────────────────┬─────────────────────────────┘
│ Dislocation Detected (<2ms)
▼
┌────────────────────────────────────────────────────────┐
│             TIER 2: Mathematical Sizing & Sim          │
│  - Analytical optimal loan sizing calculus             │
│  - Local EVM simulation against latest state           │
│  - Private Flashbots / Builder bundle packaging        │
└──────────────────────────┬─────────────────────────────┘
│ Signed Bundle Dispatch
▼
┌────────────────────────────────────────────────────────┐
│             TIER 3: On-Chain Execution                 │
│  - ArbiluxExecutor.sol smart contract                  │
│  - Atomic flash borrow → DEX swap A → DEX swap B       │
│  - Balance assertion & net profit sweep to Owner       │
└────────────────────────────────────────────────────────┘
```

### Component Roles:
* `src/ArbiluxExecutor.sol`: The core execution contract implementing `IFlashLoanSimpleReceiver`. It receives flash loans, routes token swaps through low-level calldata, ensures balance integrity, pays back the pool, and sweeps net proceeds to the owner vault.
* `test/ArbiluxForkTest.t.sol`: Comprehensive Foundry test harness that forks live Arbitrum mainnet state via Anvil, validates pool reserves, and proves flash execution profitability in sandbox before touching real assets.
* `bot/scanner/`: The local off-chain engine maintaining state tracking across all 50 target liquidity pools.
* `bot/relayer/`: The private bundle transmitter communicating with block builder endpoints.

---

## 3. Scope & Network Specifications (Initial 50 Pools)

### 3.1 Network Targets
* **Primary:** Arbitrum One (ChainID: `42161`) — Sub-250ms sequencer latency, deep liquidity, low calldata cost.
* **Secondary:** Base (ChainID: `8453`).

### 3.2 Target Tokens & Contracts (Arbitrum One)
* **WETH:** `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
* **USDC (Native):** `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
* **USDC.e (Bridged):** `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8`
* **Aave V3 PoolAddressesProvider:** `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb`
* **Uniswap V3 SwapRouter:** `0xE592427A0AEce92De3Edee1F18E0157C05861564`
* **SushiSwap Router:** `0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506`

---

## 4. Mathematical Execution Model

### 4.1 Optimal Loan Sizing Formula ($x^*$)
For two mismatched constant-product pools with reserves $(R_{1a}, R_{1b})$ on DEX 1 and $(R_{2a}, R_{2b})$ on DEX 2:

Let $\gamma_1 = 1 - \text{fee}_1$ and $\gamma_2 = 1 - \text{fee}_2$.
The optimal input volume $x^*$ borrowed in token $a$ to maximize profit is derived analytically:

$$x^* = \frac{\sqrt{R_{1a} \cdot R_{2a} \cdot R_{1b} \cdot R_{2b} \cdot \gamma_1 \cdot \gamma_2} - R_{1a} \cdot R_{2b}}{\gamma_1 \cdot R_{2b} + \gamma_1 \cdot \gamma_2 \cdot R_{1b}}$$

### 4.2 Profit Gate Equation
Execution triggers only if:
$$\text{Net Profit} = \Delta \text{Balance} - (\text{FlashLoanFee} + \text{DEXFees} + \text{L2Gas} + \text{L1CalldataGas} + \text{BuilderBribe}) \ge \text{MinThreshold}$$
* Default Minimum Profit Margin: **$2.00 USD** equivalent in native asset.

---

## 5. Antigravity Agent Engineering Rules & Guardrails

When working on this codebase, the agent must adhere to these non-negotiable rules:

1. **Security & Reentrancy:**
   - Callbacks must assert caller identity: `require(msg.sender == address(POOL), "UnauthorizedCaller")`.
   - Never allow open approval allowances. Approvals to DEX routers or lending pools must be approved for the exact required transaction amount or reset to zero.
2. **Atomic Failure Enforcement:**
   - Any execution where `balanceOf(asset) < totalDebt + minProfit` must revert immediately with custom error `NegativePnL()`.
3. **No Fluff or Mock Data:**
   - Code must be production-ready and target real Arbitrum One deployed addresses.
4. **Verification Requirement:**
   - Every smart contract update must be verified with `forge build` and proven via Foundry tests with `forge test -vvv` before declaring completion.
