/**
 * @file The solo mining odds module. It computes the chance to find a block
 * over a period, from the miner hashrate and the network difficulty. The page
 * has no build step, so this file adds two setters to the shared namespace from
 * js/version.js. Load js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 * @property {() => void} [initPriceFeed] - Open the live BTC price feed.
 * @property {() => void} [initNetworkFeed] - Read the network data once.
 * @property {() => void} [initPoolFeed] - Read the pool hashrate once.
 * @property {(height: number) => void} [setBlockHeight] - Take the block height.
 * @property {(price: number) => void} [setBtcPrice] - Take the BTC price.
 * @property {(hashrate: unknown) => void} [setMinerHashrate] - Take the miner hash rate.
 * @property {(difficulty: unknown) => void} [setNetworkDifficulty] - Take the difficulty.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /** The empty value. */
  const EMPTY = "\u2014";
  /** The hashes per difficulty share. This is 2 to the 32, 4,294,967,296. */
  const HASHES_PER_DIFF = 4294967296;
  /** The seconds in a month. */
  const SECONDS_MONTH = 2628000;
  /** The seconds in a year. */
  const SECONDS_YEAR = 31557600;
  /** The first day of 2140, in milliseconds. */
  const YEAR_2140_MS = Date.UTC(2140, 0, 1);

  /** The two inputs from the other modules. */
  const state = { hashrate: null, difficulty: null };

  /**
   * Write a value into one field, or the empty mark on a missing value.
   * @param {string} selector - The field selector.
   * @param {string} [text] - The text to write.
   * @returns {void}
   */
  const setField = (selector, text) => {
    const slot = document.querySelector(selector);
    if (slot instanceof HTMLElement) {
      slot.textContent = text === undefined || text === "" ? EMPTY : text;
    }
  };

  /**
   * Format an odds count as "1 in <number>".
   * @param {number} count - The count of trials for one success.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatOdds = (count) => {
    if (!Number.isFinite(count) || count <= 0) {
      return undefined;
    }
    const rounded = Math.max(1, Math.round(count));
    return `1 in ${rounded.toLocaleString("en-US")}`;
  };

  /**
   * Read the odds as "1 in N" for one period, in seconds.
   * @param {number} seconds - The period in seconds.
   * @returns {string | undefined} The text, or undefined on a missing input.
   */
  const oddsFor = (seconds) => {
    if (state.hashrate === null || state.difficulty === null) {
      return undefined;
    }
    const count =
      (state.difficulty * HASHES_PER_DIFF) / (state.hashrate * seconds);
    return formatOdds(count);
  };

  /**
   * Draw the three odds fields from the stored inputs.
   * @returns {void}
   */
  const render = () => {
    setField("#odds-month", oddsFor(SECONDS_MONTH));
    setField("#odds-year", oddsFor(SECONDS_YEAR));
    const until2140 = (YEAR_2140_MS - Date.now()) / 1000;
    setField("#odds-2140", oddsFor(until2140));
  };

  /**
   * Take the miner hash rate from the address search.
   * @param {unknown} hashrate - The miner hash rate in hashes per second.
   * @returns {void}
   */
  ns.setMinerHashrate = (hashrate) => {
    const value = Number(hashrate);
    if (Number.isFinite(value) && value > 0) {
      state.hashrate = value;
      render();
    }
  };

  /**
   * Take the network difficulty from the network feed.
   * @param {unknown} difficulty - The network difficulty.
   * @returns {void}
   */
  ns.setNetworkDifficulty = (difficulty) => {
    const value = Number(difficulty);
    if (Number.isFinite(value) && value > 0) {
      state.difficulty = value;
      render();
    }
  };
})();
