/**
 * @file The Bitcoin address search. It reads the address field, checks the
 * shape of the value, and looks the miner up through the pool proxy. It writes
 * the miner fields and reports the result in the status line.
 * The page has no build step, so this file adds one function to the shared
 * namespace from js/version.js. Load js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 * @property {() => void} [initPriceFeed] - Open the live BTC price feed.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /**
   * A legacy address (base58, prefix 1 or 3) or a bech32 address (prefix bc1).
   * The test is a shape check, not a checksum check.
   */
  const ADDRESS_PATTERN =
    /^(bc1[a-z0-9]{25,89}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

  /** The empty value. */
  const EMPTY = "\u2014";

  /** The four miner rows that the lookup fills. */
  const MINER_FIELDS = [
    "#miner-hashrate",
    "#miner-workers",
    "#miner-bestever",
    "#miner-authorised",
  ];

  /**
   * Set the status line and its color. An empty message clears the state.
   * @param {HTMLElement} slot - The status element.
   * @param {string} message - The text to show.
   * @param {"error"|"info"} state - The state name.
   * @returns {void}
   */
  const setStatus = (slot, message, state) => {
    slot.textContent = message;
    if (state === "error") {
      slot.dataset.state = "error";
    } else {
      delete slot.dataset.state;
    }
  };

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
   * Reset every miner field to the empty mark.
   * @returns {void}
   */
  const clearMiner = () => {
    MINER_FIELDS.forEach((selector) => setField(selector));
  };

  /**
   * Format a count with thousands separators.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatCount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toLocaleString("en-US") : undefined;
  };

  /**
   * Format a share value. A share can be large or a small fraction.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatShare = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return undefined;
    }
    return amount.toLocaleString("en-US", { maximumFractionDigits: 4 });
  };

  /**
   * Format a Unix time in seconds as a local date and time.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatTime = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return undefined;
    }
    return new Date(seconds * 1000).toLocaleString("en-US");
  };

  /**
   * Write the four miner rows from a pool reply.
   * @param {Record<string, unknown>} data - The pool reply.
   * @returns {void}
   */
  const fillMiner = (data) => {
    const hashrate = data.hashrate1m;
    setField(
      "#miner-hashrate",
      typeof hashrate === "string" ? hashrate : undefined,
    );
    setField("#miner-workers", formatCount(data.workers));
    setField("#miner-bestever", formatShare(data.bestever));
    setField("#miner-authorised", formatTime(data.authorised));
  };

  /**
   * Look the address up through the pool proxy and fill the miner rows.
   * @param {string} address - The Bitcoin address.
   * @param {HTMLElement} status - The status element.
   * @returns {Promise<void>} Resolves when the lookup ends.
   */
  const lookup = async (address, status) => {
    setStatus(status, `Looking up the miner for ${address}...`, "info");
    clearMiner();

    let response;
    try {
      response = await fetch(`/api/user?address=${encodeURIComponent(address)}`);
    } catch (error) {
      setStatus(
        status,
        "The pool did not answer. Check the connection and try again.",
        "error",
      );
      return;
    }

    if (response.status === 404) {
      setStatus(status, "No miner found for that address.", "error");
      return;
    }

    if (!response.ok) {
      setStatus(
        status,
        `The pool replied with an error (${response.status}).`,
        "error",
      );
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      setStatus(status, "The pool reply was not valid JSON.", "error");
      return;
    }

    fillMiner(data);
    setStatus(status, `Showing the miner for ${address}.`, "info");
  };

  /**
   * Wire the address search form. A submit reads the field, checks the shape,
   * and starts the lookup.
   * @returns {void}
   */
  ns.initAddressSearch = () => {
    const form = document.querySelector("#address-form");
    const input = document.querySelector("#address-input");
    const status = document.querySelector("#address-status");

    if (
      !(form instanceof HTMLFormElement) ||
      !(input instanceof HTMLInputElement) ||
      !(status instanceof HTMLElement)
    ) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const address = input.value.trim();

      if (address === "") {
        setStatus(status, "Enter a Bitcoin address to search.", "error");
        input.focus();
        return;
      }

      if (!ADDRESS_PATTERN.test(address)) {
        setStatus(
          status,
          "That is not a Bitcoin address. Check the value and try again.",
          "error",
        );
        input.focus();
        return;
      }

      lookup(address, status);
    });
  };
})();
