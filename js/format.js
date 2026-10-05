/**
 * @file The shared format helpers. It adds the hashrate unit formatting for the
 * two hashrate readouts. The page has no build step, so the helpers live on the
 * shared namespace from js/version.js. Load js/version.js before this file.
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
 * @property {(value: unknown) => (string | undefined)} [formatHashrate]
 * @property {(value: unknown) => (number | undefined)} [parseHashrate]
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /**
   * Normalize a ckpool hashrate string. The source uses a short form, for
   * example "958G" for 958 gigahash per second. The result reads "958 GH/s".
   * A value with no unit takes the plain "H/s". An unknown shape passes
   * through unchanged.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a missing value.
   */
  ns.formatHashrate = (value) => {
    if (typeof value !== "string" || value.trim() === "") {
      return undefined;
    }
    const match = /^([0-9.]+)\s*([A-Za-z]?)$/.exec(value.trim());
    if (!match) {
      return value;
    }
    const amount = match[1];
    const prefix = match[2].toUpperCase();
    return `${amount} ${prefix}H/s`;
  };

  /** The hashrate unit letters and their multipliers. */
  const HASH_UNITS = {
    k: 1e3,
    m: 1e6,
    g: 1e9,
    t: 1e12,
    p: 1e15,
    e: 1e18,
  };

  /**
   * Read a ckpool hashrate string as a number of hashes per second. For example
   * "958G" becomes 958000000000, and "1.01T" becomes 1010000000000. A value
   * with no unit stays as it is. A bad value gives undefined.
   * @param {unknown} value - The raw value.
   * @returns {number | undefined} The value, or undefined on a bad value.
   */
  ns.parseHashrate = (value) => {
    if (typeof value !== "string") {
      return undefined;
    }
    const match = /^([0-9.]+)\s*([A-Za-z]?)$/.exec(value.trim());
    if (!match) {
      return undefined;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return undefined;
    }
    const letter = match[2].toLowerCase();
    const step = letter === "" ? 1 : HASH_UNITS[letter];
    if (step === undefined) {
      return undefined;
    }
    return amount * step;
  };
})();
