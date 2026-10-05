/**
 * @file The Bitcoin subsidy module. It finds the block subsidy from the current
 * block height and computes the next halving estimate. The halving heights and
 * subsidies are hard coded, taken from the Halvora blocks database (table
 * halve_blocks). This module holds no network call. The network feed hands it
 * the block height, and the price feed hands it the price. The page has no
 * build step, so this file adds two functions to the shared namespace from
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
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /** The empty value. */
  const EMPTY = "\u2014";
  /** One bitcoin in satoshis. */
  const SATS_PER_BTC = 1e8;
  /** The subsidy before the first halving, in satoshis (50 BTC). */
  const BASE_SUBSIDY = 5000000000;
  /** The average time between two blocks, in minutes. */
  const BLOCK_MINUTES = 10;
  /** One year in days, for the ETA estimate. */
  const YEAR_DAYS = 365.25;
  /** One month in days, for the ETA estimate. */
  const MONTH_DAYS = YEAR_DAYS / 12;

  /**
   * The halving table. Each row is a block height and the subsidy in satoshis
   * from that height. The values come from the Halvora blocks database. The
   * subsidy holds until the next row.
   * @type {Array<[number, number]>}
   */
  const HALVINGS = [
    [210000, 2500000000],
    [420000, 1250000000],
    [630000, 625000000],
    [840000, 312500000],
    [1050000, 156250000],
    [1260000, 78125000],
    [1470000, 39062500],
    [1680000, 19531250],
    [1890000, 9765625],
    [2100000, 4882812],
    [2310000, 2441406],
    [2520000, 1220703],
    [2730000, 610351],
    [2940000, 305175],
    [3150000, 152587],
    [3360000, 76293],
    [3570000, 38146],
    [3780000, 19073],
    [3990000, 9536],
    [4200000, 4768],
    [4410000, 2384],
    [4620000, 1192],
    [4830000, 596],
    [5040000, 298],
    [5250000, 149],
    [5460000, 74],
    [5670000, 37],
    [5880000, 18],
    [6090000, 9],
    [6300000, 4],
    [6510000, 2],
    [6720000, 1],
  ];

  /** The two inputs from the other feeds. */
  const state = { height: null, price: null };

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
   * Read the block subsidy at one height, in satoshis.
   * @param {number} height - The block height.
   * @returns {number} The subsidy in satoshis.
   */
  const subsidyAt = (height) => {
    let value = BASE_SUBSIDY;
    for (const [halvingHeight, subsidy] of HALVINGS) {
      if (height >= halvingHeight) {
        value = subsidy;
      } else {
        break;
      }
    }
    return value;
  };

  /**
   * Read the next halving height above one height.
   * @param {number} height - The block height.
   * @returns {number | null} The next height, or null when none remain.
   */
  const nextHalvingHeight = (height) => {
    for (const [halvingHeight] of HALVINGS) {
      if (halvingHeight > height) {
        return halvingHeight;
      }
    }
    return null;
  };

  /**
   * Format a satoshi value as bitcoin.
   * @param {number} sats - The value in satoshis.
   * @returns {string} The text, for example "3.125 BTC".
   */
  const formatBtc = (sats) => {
    const btc = sats / SATS_PER_BTC;
    return `${btc.toLocaleString("en-US", { maximumFractionDigits: 8 })} BTC`;
  };

  /**
   * Format a value as US dollars.
   * @param {number} value - The value in dollars.
   * @returns {string} The text, for example "$270,000.00".
   */
  const formatUsd = (value) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });

  /**
   * Format a duration in the short form, for example "1y 6m 8d". Zero units
   * drop. A value under one day takes hours, and under one hour minutes. The
   * minutes mark is "min", so it does not clash with months. The year and the
   * month use an average length, so a month never reaches twelve.
   * @param {number} ms - The duration in milliseconds.
   * @returns {string} The text.
   */
  const formatEta = (ms) => {
    const totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes}min`;
    }

    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) {
      return `${totalHours}h`;
    }

    const totalDays = totalHours / 24;
    const years = Math.floor(totalDays / YEAR_DAYS);
    const afterYears = totalDays - years * YEAR_DAYS;
    const months = Math.floor(afterYears / MONTH_DAYS);
    const days = Math.floor(afterYears - months * MONTH_DAYS);

    const parts = [];
    if (years > 0) {
      parts.push(`${years}y`);
    }
    if (months > 0) {
      parts.push(`${months}m`);
    }
    if (days > 0) {
      parts.push(`${days}d`);
    }
    return parts.join(" ");
  };

  /**
   * Draw the subsidy fields from the stored inputs.
   * @returns {void}
   */
  const render = () => {
    if (state.height === null) {
      return;
    }

    const subsidy = subsidyAt(state.height);
    setField("#subsidy", formatBtc(subsidy));

    const next = nextHalvingHeight(state.height);
    if (next === null) {
      setField("#next-halving-eta", "no more halvings");
    } else {
      const etaMs = (next - state.height) * BLOCK_MINUTES * 60000;
      setField("#next-halving-eta", formatEta(etaMs));
    }

    if (state.price !== null) {
      setField(
        "#subsidy-value",
        formatUsd((subsidy / SATS_PER_BTC) * state.price),
      );
    }
  };

  /**
   * Take the block height from the network feed.
   * @param {number} height - The block height.
   * @returns {void}
   */
  ns.setBlockHeight = (height) => {
    const value = Number(height);
    if (Number.isFinite(value)) {
      state.height = value;
      render();
    }
  };

  /**
   * Take the BTC price from the price feed.
   * @param {number} price - The price in US dollars.
   * @returns {void}
   */
  ns.setBtcPrice = (price) => {
    const value = Number(price);
    if (Number.isFinite(value)) {
      state.price = value;
      render();
    }
  };
})();
