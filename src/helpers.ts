import {
    Address, BigDecimal, BigInt, Bytes, TypedMap
  } from "@graphprotocol/graph-ts"
  import { Trade, UserTokenPosition, Token } from "../generated/schema"
  
  function toBigDecimal(x: BigInt, decimals: number = 18): BigDecimal {
    const ten = BigInt.fromI32(10)
    let denom = BigInt.fromI32(1)
    for (let i = 0; i < decimals; i++) denom = denom.times(ten)
    return x.toBigDecimal().div(denom.toBigDecimal())
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
    const qtyEth = toBigDecimal(qtyEthRaw)
    const qtyTok = toBigDecimal(qtyTokenRaw, 18) // TODO: read decimals if not 18
  
    // Trade entity
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
  
    // Position updates
    let p = loadOrCreatePosition(user, token, ts)
  
    if (side == "BUY") {
      // Weighted average cost per token (over *held* units)
      const held = p.balance.toBigDecimal()
      const prevCost = p.avgCostEthPerToken || BigDecimal.zero()
      const newHeld = held.plus(qtyTok)
      const newAvg = newHeld.gt(BigDecimal.zero())
        ? prevCost.times(held).plus(qtyEth).div(newHeld)
        : prevCost
  
      p.avgCostEthPerToken = newAvg
      p.totalEthBought = p.totalEthBought.plus(qtyEth)
      p.totalTokensBought = p.totalTokensBought.plus(qtyTok)
      p.balance = p.balance.plus(qtyTokenRaw)
    } else {
      // SELL
      // Realized PnL (optional)
      const costEth = (p.avgCostEthPerToken || BigDecimal.zero()).times(qtyTok)
      const pnl = qtyEth.minus(costEth)
      p.realizedPnLEth = (p.realizedPnLEth || BigDecimal.zero()).plus(pnl)
  
      p.totalEthSold = p.totalEthSold.plus(qtyEth)
      p.totalTokensSold = p.totalTokensSold.plus(qtyTok)
      p.balance = p.balance.minus(qtyTokenRaw)
      if (p.balance.lt(BigInt.zero())) p.balance = BigInt.zero()
    }
  
    p.updatedAt = ts
    p.save()
  
    // Token quick touches
    let tok = Token.load(token.toHexString())
    if (tok != null) {
      tok.latestPriceEth = qtyTok.gt(BigDecimal.zero()) ? qtyEth.div(qtyTok) : tok.latestPriceEth
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
  