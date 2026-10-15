/**
 * @file The Bitcoin network data feed. On page load it reads the block height,
 * the network difficulty, the year-over-year difficulty change, the network
 * hashrate, and the year-over-year hashrate change from the pool proxy, and
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
 * @property {(value: unknown) => (string | undefined)} [formatHashrateValue]
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

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
   * Read the direction of a change. A flat value takes a dot.
   * @param {number} value - The signed change value.
   * @returns {{ name: string, symbol: string }} The class name and the symbol.
   */
  const readDirection = (value) => {
    if (value > 0) {
      return { name: "up", symbol: "\u2191" };
    }
    if (value < 0) {
      return { name: "down", symbol: "\u2193" };
    }
    return { name: "flat", symbol: "\u2022" };
  };

  /**
   * Write a value and, beside it, the year-over-year change. The change takes a
   * direction color: green up, red down, grey flat. A missing change leaves the
   * value alone.
   * @param {string} selector - The field selector.
   * @param {string | undefined} text - The value text.
   * @param {unknown} change - The year-over-year change in percent.
   * @returns {void}
   */
  const paintChange = (selector, text, change) => {
    const slot = document.querySelector(selector);
    if (!(slot instanceof HTMLElement)) {
      return;
    }
    slot.textContent = text === undefined || text === "" ? "\u2014" : text;

    if (change === null || change === undefined || change === "") {
      return;
    }
    const amount = Number(change);
    if (!Number.isFinite(amount)) {
      return;
    }
    const direction = readDirection(amount);
    const marker = document.createElement("span");
    marker.className = `price-change price-change--${direction.name}`;
    marker.textContent = `${direction.symbol} ${Math.abs(amount).toFixed(2)}% YoY`;
    slot.append(document.createTextNode(" "));
    slot.append(marker);
  };

  /**
   * Write the network rows from a network reply.
   * @param {Record<string, unknown>} data - The network reply.
   * @returns {void}
   */
  const fillNetwork = (data) => {
    ns.setField("#block-height", ns.formatCount(data.height));
    paintChange(
      "#network-difficulty",
      formatUnit(data.difficulty, UNIT_PER_T, "T"),
      data.difficultyChange,
    );
    paintChange(
      "#network-hashrate",
      ns.formatHashrateValue(data.hashrate),
      data.hashrateChange,
    );

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
