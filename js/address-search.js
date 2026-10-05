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
 * @property {(hashrate: unknown) => void} [setMinerHashrate] - Take the miner hash rate.
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
   * The share units, largest first. Miners show a share as a number plus one of
   * these letters, for example "423.57 G".
   * @type {Array<[number, string]>}
   */
  const SHARE_UNITS = [
    [1e18, "E"],
    [1e15, "P"],
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
  ];

  /**
   * Set the status line and its color. An empty message clears the state.
   * @param {HTMLElement} slot - The status element.
   * @param {string | Node} content - The text, or a node to append.
   * @param {"error"|"info"} state - The state name.
   * @returns {void}
   */
  const setStatus = (slot, content, state) => {
    if (typeof content === "string") {
      slot.textContent = content;
    } else {
      slot.textContent = "";
      slot.append(content);
    }
    if (state === "error") {
      slot.dataset.state = "error";
    } else {
      delete slot.dataset.state;
    }
  };

  /**
   * Build a status line that holds the address in its own mark. The mark takes
   * the accent color from css/style.css.
   * @param {string} lead - The text before the address.
   * @param {string} address - The Bitcoin address.
   * @param {string} tail - The text after the address.
   * @returns {DocumentFragment} The content for the status line.
   */
  const addressStatus = (lead, address, tail) => {
    const fragment = document.createDocumentFragment();
    fragment.append(document.createTextNode(lead));
    const mark = document.createElement("span");
    mark.className = "status__address";
    mark.textContent = address;
    fragment.append(mark);
    fragment.append(document.createTextNode(tail));
    return fragment;
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
   * Format a share value in the miner style: a number plus a unit letter, for
   * example "423.57 G". The largest unit that fits takes the letter. A value
   * below one thousand stays a plain number.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatShare = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      return undefined;
    }
    for (const [step, unit] of SHARE_UNITS) {
      if (amount >= step) {
        const scaled = amount / step;
        return `${scaled.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })} ${unit}`;
      }
    }
    return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  /**
   * Format a Unix time in seconds as a local date. The time of day drops.
   * @param {unknown} value - The raw value.
   * @returns {string | undefined} The text, or undefined on a bad value.
   */
  const formatTime = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return undefined;
    }
    return new Date(seconds * 1000).toLocaleDateString("en-US");
  };

  /**
   * Write the four miner rows from a pool reply.
   * @param {Record<string, unknown>} data - The pool reply.
   * @returns {void}
   */
  const fillMiner = (data) => {
    const hashrate =
      typeof ns.formatHashrate === "function"
        ? ns.formatHashrate(data.hashrate1m)
        : undefined;
    setField("#miner-hashrate", hashrate);

    /* Hand the numeric hash rate to the odds module. */
    if (typeof ns.setMinerHashrate === "function") {
      ns.setMinerHashrate(ns.parseHashrate(data.hashrate1m));
    }

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
    setStatus(
      status,
      addressStatus("Showing miner ", address, ""),
      "info",
    );
  };

  /**
   * Read the address from the page URL.
   * @returns {string} The address, or an empty string.
   */
  const readUrlAddress = () => {
    const search = page.location ? page.location.search : "";
    if (typeof search !== "string" || search === "") {
      return "";
    }
    try {
      const params = new URLSearchParams(search);
      return (params.get("address") || "").trim();
    } catch (error) {
      return "";
    }
  };

  /**
   * Write the address into the page URL. The history entry is replaced, so the
   * back button stays clean. A plain bookmark then keeps the address.
   * @param {string} address - The Bitcoin address.
   * @returns {void}
   */
  const writeUrlAddress = (address) => {
    if (!page.history || typeof page.history.replaceState !== "function") {
      return;
    }
    page.history.replaceState(
      null,
      "",
      `?address=${encodeURIComponent(address)}`,
    );
  };

  /**
   * Wire the address search form. A submit reads the field, checks the shape,
   * and starts the lookup. An address in the URL runs at once, so a bookmark
   * works.
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

    /* An address in the URL runs at once, so a bookmark opens the miner. */
    const fromUrl = readUrlAddress();
    if (ADDRESS_PATTERN.test(fromUrl)) {
      input.value = fromUrl;
      lookup(fromUrl, status);
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

      writeUrlAddress(address);
      lookup(address, status);
    });
  };
})();
