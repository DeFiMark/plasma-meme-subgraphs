import { BigDecimal, BigInt, Bytes, Address, log } from "@graphprotocol/graph-ts"
import {
  NewTokenCreated,
  Bonded
} from "../generated/Database/Database"
import {
  Buy as BondingCurveBuyEvent,
  Sell as BondingCurveSellEvent
} from "../generated/templates/BondingCurve/BondingCurve"
import {
  Buy as FactoryBuyEvent,
  Sell as FactorySellEvent
} from "../generated/Factory/Factory"
import { Transfer } from "../generated/templates/Token/ERC20"
import { Token, User, UserToken, TokenHolder } from "../generated/schema"
import { BondingCurve, Token as TokenTemplate } from "../generated/templates"

// Helper to convert WEI to ETH
function toBigDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"));
}

// =============================================
// Database Contract Handlers
// =============================================

export function handleNewTokenCreated(event: NewTokenCreated): void {
  // Create a new Token entity with its address as the ID
  let token = new Token(event.params.token.toHexString());
  token.creator = event.params.dev;
  token.bondingCurve = event.params.bondingCurve;
  token.name = event.params.name;
  token.symbol = event.params.symbol;
  token.bonded = false; // Initialize as not bonded
  token.save();

  // Start dynamically tracking the new BondingCurve contract
  BondingCurve.create(event.params.bondingCurve);

  // (Lower Priority) Start dynamically tracking the new Token contract for Transfers
  TokenTemplate.create(event.params.token);
}

export function handleBonded(event: Bonded): void {
  let token = Token.load(event.params.token.toHexString());
  if (token) {
    token.bonded = true;
    token.save();
  } else {
    log.warning("Bonded event for a token that does not exist: {}", [event.params.token.toHexString()]);
  }
}

// =============================================
// Shared Trade Logic
// =============================================

function processBuy(tokenAddress: Address, userAddress: Address, ethAmount: BigInt, tokenAmount: BigInt): void {
  // Ensure the User entity exists
  let user = User.load(userAddress.toHexString());
  if (!user) {
    user = new User(userAddress.toHexString());
    user.save();
  }

  // Get the composite ID for the UserToken entity
  let userTokenId = userAddress.toHexString() + "-" + tokenAddress.toHexString();
  let userToken = UserToken.load(userTokenId);

  // If this is the user's first interaction with this token, create the entity
  if (!userToken) {
    userToken = new UserToken(userTokenId);
    userToken.user = user.id;
    userToken.token = tokenAddress.toHexString();
    userToken.totalETHBought = BigDecimal.zero();
    userToken.totalETHSold = BigDecimal.zero();
    userToken.totalTokensBought = BigDecimal.zero();
    userToken.totalTokensSold = BigDecimal.zero();
  }

  // Update totals
  userToken.totalETHBought = userToken.totalETHBought.plus(toBigDecimal(ethAmount));
  userToken.totalTokensBought = userToken.totalTokensBought.plus(toBigDecimal(tokenAmount));
  userToken.save();
}


function processSell(tokenAddress: Address, userAddress: Address, ethAmount: BigInt, tokenAmount: BigInt): void {
  // Ensure the User entity exists
  let user = User.load(userAddress.toHexString());
  if (!user) {
    user = new User(userAddress.toHexString());
    user.save();
  }

  // Get the composite ID for the UserToken entity
  let userTokenId = userAddress.toHexString() + "-" + tokenAddress.toHexString();
  let userToken = UserToken.load(userTokenId);

  // This should theoretically always exist if a user is selling, but we check just in case.
  if (!userToken) {
    userToken = new UserToken(userTokenId);
    userToken.user = user.id;
    userToken.token = tokenAddress.toHexString();
    userToken.totalETHBought = BigDecimal.zero();
    userToken.totalETHSold = BigDecimal.zero();
    userToken.totalTokensBought = BigDecimal.zero();
    userToken.totalTokensSold = BigDecimal.zero();
  }
  
  // Update totals
  userToken.totalETHSold = userToken.totalETHSold.plus(toBigDecimal(ethAmount));
  userToken.totalTokensSold = userToken.totalTokensSold.plus(toBigDecimal(tokenAmount));
  userToken.save();
}

// =============================================
// Bonding Curve Handlers
// =============================================

export function handleBondingCurveBuy(event: BondingCurveBuyEvent): void {
  processBuy(event.params.token, event.params.user, event.params.quantityETH, event.params.quantityTokens);
}

export function handleBondingCurveSell(event: BondingCurveSellEvent): void {
  processSell(event.params.token, event.params.user, event.params.quantityETH, event.params.quantityTokens);
}

// =============================================
// Factory Contract Handlers
// =============================================

export function handleFactoryBuy(event: FactoryBuyEvent): void {
  processBuy(event.params.token, event.params.user, event.params.quantityETH, event.params.quantityTokens);
}

export function handleFactorySell(event: FactorySellEvent): void {
  processSell(event.params.token, event.params.user, event.params.quantityETH, event.params.quantityTokens);
}

// =============================================
// (Lower Priority) Token Transfer Handler
// =============================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function handleTransfer(event: Transfer): void {
  let tokenAddress = event.address.toHexString();
  let fromAddress = event.params.from.toHexString();
  let toAddress = event.params.to.toHexString();
  let amount = toBigDecimal(event.params.value);

  // Ignore zero-value transfers
  if (amount == BigDecimal.zero()) {
    return;
  }

  // --- Handle sender (from) ---
  if (fromAddress != ZERO_ADDRESS) {
    let senderId = tokenAddress + "-" + fromAddress;
    let sender = TokenHolder.load(senderId);
    // This should always exist for a sender, but we handle the edge case
    if (sender) {
      sender.balance = sender.balance.minus(amount);
      sender.save();
    }
  }

  // --- Handle receiver (to) ---
  if (toAddress != ZERO_ADDRESS) {
    let receiverId = tokenAddress + "-" + toAddress;
    let receiver = TokenHolder.load(receiverId);
    if (!receiver) {
      // Create User if they don't exist
      let user = User.load(toAddress);
      if (!user) {
        user = new User(toAddress);
        user.save();
      }
      // Create new TokenHolder
      receiver = new TokenHolder(receiverId);
      receiver.token = tokenAddress;
      receiver.user = toAddress;
      receiver.balance = BigDecimal.zero();
    }
    receiver.balance = receiver.balance.plus(amount);
    receiver.save();
  }
}