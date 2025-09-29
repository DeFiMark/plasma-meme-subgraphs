import { Address, BigInt } from "@graphprotocol/graph-ts"
import { Token } from "../generated/schema"
import { ERC20 as ERC20Template } from "../generated/templates"
import { BondingCurve as BondingCurveTemplate } from "../generated/templates"
import {
  NewTokenCreated as NewTokenCreatedEvent,
  Bonded as BondedEvent
} from "../generated/Database/Database"

export function handleNewTokenCreated(event: NewTokenCreatedEvent): void {
  const tokenAddr = event.params.token
  const curveAddr = event.params.bondingCurve

  let token = Token.load(tokenAddr.toHexString())
  if (token == null) {
    token = new Token(tokenAddr.toHexString())
    token.creator = event.params.dev
    token.bondingCurve = curveAddr
    token.createdAt = event.block.timestamp
  }
  token.updatedAt = event.block.timestamp
  token.save()

  // Start indexing ERC20 Transfers for this token
  ERC20Template.create(tokenAddr)
  // Start indexing BondingCurve Buy/Sell for this token’s curve
  BondingCurveTemplate.create(curveAddr)
}

export function handleBonded(event: BondedEvent): void {
  const tokenAddr = event.params.token
  let token = Token.load(tokenAddr.toHexString())
  if (token == null) return
  token.bondedAt = event.block.timestamp
  token.updatedAt = event.block.timestamp
  token.save()
}
