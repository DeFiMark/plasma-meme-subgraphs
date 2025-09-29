// src/helpers.ts
import { Address, BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { Trade, UserTokenPosition, Token } from "../generated/schema"

// Use a precomputed 1e18 to avoid i32/loop fuss
const BI_1E18 = BigInt.fromString("1000000000000000000")

function toDecimal18(x: BigInt): BigDecimal {
  return x.toBigDecimal().div(BI_1E18.toBigDecimal())
}

export function positionId(user: Address, token: Address): string {
  return user.toHexString() + "-" + token.toHexString()
}

export function loadOrCreatePosition(user: Address, token: Address, ts: BigInt): UserTokenPosition {
  const id = positionId(user, token)
  let p = UserTokenPosition.load(id)
  if (p == null) {
    p = new UserTokenPosition(id)
    p.user = user
    p.token = token
    p.balance = BigInt.zero()
    p.avgCostEthPerToken = BigDecimal.zero()
    p.totalEthBought = BigDecimal.zero()
    p.totalTokensBought = BigDecimal.zero()
    p.totalEthSold = BigDecimal.zero()
    p.totalTokensSold = BigDecimal.zero()
    p.realizedPnLEth = BigDecimal.zero()
  }
  p.updatedAt = ts
  return p as UserTokenPosition
}

export function recordTradeAndPositions(
  source: string,                // "DEX" | "CURVE"
  side: string,                  // "BUY" | "SELL"
  ts: BigInt,
  txHash: Bytes,
  logIndex: BigInt,
  user: Address,
  token: Address,
  qtyEthRaw: BigInt,
  qtyTokenRaw: BigInt
): void {
  const qtyEth = toDecimal18(qtyEthRaw)
  const qtyTok = toDecimal18(qtyTokenRaw) // assumes 18; add per-token decimals later

  // Trade
  const tradeId = txHash.toHexString() + "-" + logIndex.toString()
  const t = new Trade(tradeId)
  t.txHash = txHash
  t.logIndex = logIndex
  t.timestamp = ts
  t.user = user
  t.token = token
  t.side = side
  t.quantityETH = qtyEth
  t.quantityTokens = qtyTok
  t.source = source
  t.save()

  // Position
  let p = loadOrCreatePosition(user, token, ts)

  let _avg = p.avgCostEthPerToken
  if (_avg == null) {
    _avg = BigDecimal.zero()
    p.avgCostEthPerToken = _avg as BigDecimal
  }
  const prevCost = _avg as BigDecimal

  // realizedPnLEth
  let _realized = p.realizedPnLEth
  if (_realized == null) {
    _realized = BigDecimal.zero()
    p.realizedPnLEth = _realized as BigDecimal
  }
  const realizedNow = _realized as BigDecimal

  if (side == "BUY") {
    const held = toDecimal18(p.balance)
    const newHeld = held.plus(qtyTok)

    // compute new average (no nullable values here)
    let newAvg = prevCost
    if (newHeld.gt(BigDecimal.zero())) {
      newAvg = prevCost.times(held).plus(qtyEth).div(newHeld)
    }

    p.avgCostEthPerToken = newAvg
    p.totalEthBought = p.totalEthBought.plus(qtyEth)
    p.totalTokensBought = p.totalTokensBought.plus(qtyTok)
    p.balance = p.balance.plus(qtyTokenRaw)
  } else {
    // SELL
    const costEth = prevCost.times(qtyTok)
    const pnl = qtyEth.minus(costEth)
    p.realizedPnLEth = realizedNow.plus(pnl)

    p.totalEthSold = p.totalEthSold.plus(qtyEth)
    p.totalTokensSold = p.totalTokensSold.plus(qtyTok)
    p.balance = p.balance.minus(qtyTokenRaw)
    if (p.balance.lt(BigInt.zero())) p.balance = BigInt.zero()
  }

  p.updatedAt = ts
  p.save()

  // Token quick touch (unchanged)
  let tok = Token.load(token.toHexString())
  if (tok != null) {
    if (qtyTok.gt(BigDecimal.zero())) {
      tok.latestPriceEth = qtyEth.div(qtyTok)
    }
    tok.updatedAt = ts
    tok.save()
  }
}

export function updateBalanceFromTransfer(
  from: Address,
  to: Address,
  token: Address,
  value: BigInt,
  ts: BigInt
): void {
  // credit receiver
  if (to.notEqual(Address.zero())) {
    let pTo = loadOrCreatePosition(to, token, ts)
    pTo.balance = pTo.balance.plus(value)
    pTo.updatedAt = ts
    pTo.save()
  }
  // debit sender
  if (from.notEqual(Address.zero())) {
    let pFrom = loadOrCreatePosition(from, token, ts)
    pFrom.balance = pFrom.balance.minus(value)
    if (pFrom.balance.lt(BigInt.zero())) pFrom.balance = BigInt.zero()
    pFrom.updatedAt = ts
    pFrom.save()
  }
}
