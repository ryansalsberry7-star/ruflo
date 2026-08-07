import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampRaiseTo,
  getLegalActions,
  getSizingOptions,
  resolvePreAction,
  type TablePlayer,
  type TableState,
} from '../lib/betting';

function seat(overrides: Partial<TablePlayer> = {}): TablePlayer {
  return {
    id: 'hero',
    name: 'Hero',
    stack: 100,
    folded: false,
    allIn: false,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    streetContribution: 0,
    ...overrides,
  };
}

function table(overrides: Partial<TableState> = {}, players: TablePlayer[] = [seat()]): TableState {
  return {
    id: 't1',
    variant: 'nlh',
    currentStreet: 'flop',
    pot: 10,
    players,
    communityCards: [],
    currentTurn: 'hero',
    smallBlind: 0.5,
    bigBlind: 1,
    currentBet: 0,
    minRaise: 1,
    ...overrides,
  };
}

test('nothing is legal when it is not the player turn', () => {
  const legal = getLegalActions(table({ currentTurn: 'villain' }), 'hero');
  assert.equal(legal.canFold, false);
  assert.equal(legal.canCheck, false);
  assert.equal(legal.canBet, false);
});

test('folded, all-in, and unseated players get no actions', () => {
  assert.equal(getLegalActions(table({}, [seat({ folded: true })]), 'hero').canFold, false);
  assert.equal(getLegalActions(table({}, [seat({ allIn: true })]), 'hero').canCheck, false);
  assert.equal(getLegalActions(table(), 'stranger').canFold, false);
});

test('with no bet outstanding a player may check or bet, never call', () => {
  const legal = getLegalActions(table({ currentBet: 0 }), 'hero');
  assert.equal(legal.canCheck, true);
  assert.equal(legal.canBet, true);
  // Check and Call are mutually exclusive; showing both is what produced server rejections.
  assert.equal(legal.canCall, false);
  assert.equal(legal.canRaise, false);
  assert.equal(legal.amountToCall, 0);
});

test('facing a bet a player may call or raise, never check', () => {
  const legal = getLegalActions(table({ currentBet: 8, minRaise: 8 }), 'hero');
  assert.equal(legal.canCheck, false);
  assert.equal(legal.canCall, true);
  assert.equal(legal.canRaise, true);
  assert.equal(legal.canBet, false);
  assert.equal(legal.amountToCall, 8);
  assert.equal(legal.minRaiseTo, 16);
});

test('amount to call accounts for chips already committed this street', () => {
  const legal = getLegalActions(table({ currentBet: 10 }, [seat({ streetContribution: 4 })]), 'hero');
  assert.equal(legal.amountToCall, 6);
});

test('a short stack cannot call beyond its chips and can only shove', () => {
  const legal = getLegalActions(table({ currentBet: 200, minRaise: 200 }, [seat({ stack: 30 })]), 'hero');
  assert.equal(legal.canCall, false, 'cannot cover a 200 bet with 30 chips');
  assert.equal(legal.canRaise, false, 'no raise room below the current bet');
  assert.equal(legal.canAllIn, true);
  assert.equal(legal.amountToCall, 30, 'call amount is capped at the stack');
});

test('raise sizing is clamped into the legal window', () => {
  const legal = getLegalActions(table({ currentBet: 8, minRaise: 8 }, [seat({ stack: 100 })]), 'hero');
  assert.equal(clampRaiseTo(1, legal), legal.minRaiseTo, 'below minimum snaps up');
  assert.equal(clampRaiseTo(99999, legal), legal.maxRaiseTo, 'above stack snaps down');
  assert.equal(clampRaiseTo(40, legal), 40);
});

test('pot-fraction sizing is computed from real state, not fixed constants', () => {
  const state = table({ pot: 20, currentBet: 10, minRaise: 10 }, [seat({ stack: 500 })]);
  const legal = getLegalActions(state, 'hero');
  const options = getSizingOptions(state, legal);
  const pot = options.find((option) => option.label === 'Pot');

  // A pot raise puts in the call plus the pot as it stands after that call:
  // currentBet 10 + 1.0 x (pot 20 + toCall 10) = 40.
  assert.ok(pot, 'pot option should exist');
  assert.equal(pot.raiseTo, 40);
  assert.equal(options[0].label, 'Min');
  assert.equal(options[options.length - 1].label, 'All-in');
});

test('sizing options collapse to min and all-in for a short stack', () => {
  const state = table({ pot: 500, currentBet: 2, minRaise: 2 }, [seat({ stack: 6 })]);
  const legal = getLegalActions(state, 'hero');
  const options = getSizingOptions(state, legal);

  // Every pot fraction exceeds the stack here, so only the endpoints survive and
  // no duplicate amounts are offered.
  const amounts = options.map((option) => option.raiseTo);
  assert.deepEqual(amounts, [...new Set(amounts)], 'no duplicate sizing amounts');
  assert.ok(options.every((option) => option.raiseTo <= legal.maxRaiseTo));
});

test('check-fold checks when free and folds only when a bet appeared', () => {
  const noBet = getLegalActions(table({ currentBet: 0 }), 'hero');
  assert.equal(resolvePreAction('check-fold', noBet), 'check');

  const facingBet = getLegalActions(table({ currentBet: 8, minRaise: 8 }), 'hero');
  assert.equal(resolvePreAction('check-fold', facingBet), 'fold');
});

test('call-any commits everything when the bet exceeds the stack', () => {
  const covered = getLegalActions(table({ currentBet: 8, minRaise: 8 }), 'hero');
  assert.equal(resolvePreAction('call-any', covered), 'call');

  const shortStack = getLegalActions(table({ currentBet: 200, minRaise: 200 }, [seat({ stack: 30 })]), 'hero');
  assert.equal(resolvePreAction('call-any', shortStack), 'all-in');
});

test('no pre-action resolves to no action', () => {
  assert.equal(resolvePreAction(null, getLegalActions(table(), 'hero')), null);
});

test('pot-limit caps the raise ceiling at the pot while no-limit allows a full shove', () => {
  const deepStack = [seat({ stack: 500 })];
  const shape = { pot: 20, currentBet: 10, minRaise: 10 };

  const nlh = getLegalActions(table({ ...shape, variant: 'nlh' }, deepStack), 'hero');
  const plo = getLegalActions(table({ ...shape, variant: 'plo' }, deepStack), 'hero');

  // No-limit tops out at the stack; pot-limit at currentBet 10 + (pot 20 + toCall 10) = 40.
  assert.equal(nlh.maxRaiseTo, 500);
  assert.equal(plo.maxRaiseTo, 40);
  assert.ok(plo.maxRaiseTo < nlh.maxRaiseTo);
});

test('a deep stack cannot shove under pot limit, so the all-in option is withheld', () => {
  const deep = table({ pot: 20, currentBet: 10, minRaise: 10, variant: 'plo' }, [seat({ stack: 500 })]);
  const legal = getLegalActions(deep, 'hero');
  assert.equal(legal.canAllIn, false, 'a stack deeper than the pot has no legal shove');

  // The ceiling chip must say what it actually is rather than promising an all-in.
  const options = getSizingOptions(deep, legal);
  assert.equal(options[options.length - 1].label, 'Pot Max');
});

test('a short stack can still shove under pot limit', () => {
  const short = table({ pot: 200, currentBet: 2, minRaise: 2, variant: 'plo' }, [seat({ stack: 6 })]);
  const legal = getLegalActions(short, 'hero');
  assert.equal(legal.canAllIn, true, 'a stack shallower than the pot can commit everything');
  assert.equal(legal.maxRaiseTo, 6);
});
