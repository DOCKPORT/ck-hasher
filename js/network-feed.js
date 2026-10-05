/**
 * @file The Bitcoin network data feed. On page load it reads the block height,
 * the network difficulty, and the network hashrate from the pool proxy, and
 * writes them into the Network data panel. A failure leaves the empty marks.
 * The page has no build step, so this file adds one function to the shared
 * namespace from js/version.js. Load js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 * @property {() => void} [initPriceFeed] - Open the live BTC price feed.
 * @property {() => void} [initNetworkFeed] - Read the network data once.
 * @property {(difficulty: unknown) => void} [setNetworkDifficulty] - Take the difficulty.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /** One exahash in hashes per second. */
  const HASH_PER_EH = 1e18;
  /** One trillion in plain units. */
  const UNIT_PER_T = 1e12;

  /**
   * Scale a value and add the unit.
   * @param {unknown} value - The raw value.
   * @param {number} divisor - The scale divisor.
   * @param {string} unit - The unit label.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatUnit = (value, divisor, unit) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount === 0) {
      return undefined;
    }
    const scaled = amount / divisor;
    return `${scaled.toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })} ${unit}`;
  };

  /**
   * Write the network rows from a network reply.
   * @param {Record<string, unknown>} data - The network reply.
   * @returns {void}
   */
  const fillNetwork = (data) => {
    ns.setField("#block-height", ns.formatCount(data.height));
    ns.setField("#network-difficulty", formatUnit(data.difficulty, UNIT_PER_T, "T"));
    ns.setField("#network-hashrate", formatUnit(data.hashrate, HASH_PER_EH, "EH/s"));

    /* Hand the height to the subsidy module. */
    if (typeof ns.setBlockHeight === "function") {
      ns.setBlockHeight(Number(data.height));
    }

    /* Hand the difficulty to the odds module. */
    if (typeof ns.setNetworkDifficulty === "function") {
      ns.setNetworkDifficulty(data.difficulty);
    }
  };

  /**
   * Read the network data once and fill the Network data panel.
   * @returns {void}
   */
  ns.initNetworkFeed = () => {
    ns.loadJson("/api/network", "the network data", fillNetwork);
  };
})();
