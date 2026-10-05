/**
 * @file The shared page helpers. It adds the field writer, the count and money
 * formatting, the JSON feed reader, and the hashrate unit formatting for the two
 * hashrate readouts. The page has no build step, so the helpers live on the
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
 * @property {(selector: string, text?: string) => void} [setField] - Write one field.
 * @property {(value: unknown) => (string | undefined)} [formatCount] - Format a count.
 * @property {(value: unknown) => string} [formatUsd] - Format a dollar value.
 * @property {(url: string, label: string,
 *   fill: (data: Record<string, unknown>) => void) => void} [loadJson] - Read one JSON feed.
 * @property {(value: unknown) => (string | undefined)} [formatHashrate]
 * @property {(value: unknown) => (number | undefined)} [parseHashrate]
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /** The empty value. */
  const EMPTY = "\u2014";

  /**
   * Write a value into one field, or the empty mark on a missing value.
   * @param {string} selector - The field selector.
   * @param {string} [text] - The text to write.
   * @returns {void}
   */
  ns.setField = (selector, text) => {
    const slot = document.querySelector(selector);
    if (slot instanceof HTMLElement) {
      slot.textContent = text === undefined || text === "" ? EMPTY : text;
    }
  };

  /**
   * Format a count with thousands separators.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  ns.formatCount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toLocaleString("en-US") : undefined;
  };

  /**
   * Format a value as US dollars. A bad value takes the empty mark.
   * @param {unknown} value - The raw value.
   * @returns {string} The text, for example "$270,000.00".
   */
  ns.formatUsd = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return "\u2014";
    }
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  /**
   * Read one JSON feed and hand the reply to a fill function. A failure is
   * logged with the label, and the page marks stay in place.
   * @param {string} url - The feed path.
   * @param {string} label - The feed name for the log line.
   * @param {(data: Record<string, unknown>) => void} fill - The fill function.
   * @returns {void}
   */
  ns.loadJson = (url, label, fill) => {
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        return response.json();
      })
      .then(fill)
      .catch((error) => {
        console.error(`ck-hasher: ${label} did not load`, error);
      });
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
   * Read the multiplier for a hashrate unit letter. An empty letter means
   * hashes per second. An unknown letter gives undefined.
   * @param {string} prefix - The unit letter.
   * @returns {number | undefined} The multiplier, or undefined.
   */
  const hashStep = (prefix) => {
    if (prefix === "") {
      return 1;
    }
    return HASH_UNITS[prefix.toLowerCase()];
  };

  /**
   * Read a ckpool hashrate string into its parts. The source uses a short form,
   * for example "958G" for 958 gigahash per second.
   * @param {unknown} raw - The raw value.
   * @returns {{ text: string, value: number, prefix: string } | null} The
   * parts, or null on a bad value.
   */
  const readHashrate = (raw) => {
    if (typeof raw !== "string") {
      return null;
    }
    const match = /^([0-9.]+)\s*([A-Za-z]?)$/.exec(raw.trim());
    if (!match) {
      return null;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return null;
    }
    return { text: match[1], value: amount, prefix: match[2].toUpperCase() };
  };

  /**
   * Normalize a ckpool hashrate string. The source uses a short form, for
   * example "958G" for 958 gigahash per second. The result reads "958 GH/s".
   * A value with no unit takes the plain "H/s". A bad value or an unknown unit
   * gives undefined, so the readout and the odds feature agree.
   * @param {unknown} raw - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  ns.formatHashrate = (raw) => {
    const parts = readHashrate(raw);
    if (parts === null || hashStep(parts.prefix) === undefined) {
      return undefined;
    }
    return `${parts.text} ${parts.prefix}H/s`;
  };

  /**
   * Read a ckpool hashrate string as a number of hashes per second. For example
   * "958G" becomes 958000000000, and "1.01T" becomes 1010000000000. A value
   * with no unit stays as it is. A bad value gives undefined.
   * @param {unknown} raw - The raw value.
   * @returns {number | undefined} The value, or undefined on a bad value.
   */
  ns.parseHashrate = (raw) => {
    const parts = readHashrate(raw);
    if (parts === null) {
      return undefined;
    }
    const step = hashStep(parts.prefix);
    if (step === undefined) {
      return undefined;
    }
    return parts.value * step;
  };
})();
