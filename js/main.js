/**
 * @file The page entry point. It stamps the footer and reports a missing
 * version. The page has no build step, so this file reads the global namespace
 * that js/version.js sets. Load js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js and js/address-search.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 * @property {() => void} [initPriceFeed] - Open the live BTC price feed.
 * @property {() => void} [initNetworkFeed] - Read the network data once.
 * @property {() => void} [initPoolFeed] - Read the pool hashrate once.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER;

  /**
   * Write the current year into the footer.
   * @returns {void}
   */
  const stampYear = () => {
    const slot = document.querySelector("#footer-year");
    if (slot instanceof HTMLElement) {
      slot.textContent = `\u00A9 ${new Date().getFullYear()}`;
    }
  };

  /**
   * Write the app version into the footer brand slot. The label reads
   * "ck-hasher Dashboard v0.1.0" with no brackets. The value comes from
   * js/version.js.
   * @returns {void}
   */
  const stampVersion = () => {
    const slot = document.querySelector("#footer-brand");
    const version = ns ? ns.version : undefined;

    if (
      slot instanceof HTMLElement &&
      typeof version === "string" &&
      version !== ""
    ) {
      slot.textContent = `ck-hasher Dashboard ${version}`;
    }
  };

  /**
   * Run one init function from the shared namespace. A failure in one part
   * must not stop another part.
   * @param {string} name - The namespace key.
   * @returns {void}
   */
  const run = (name) => {
    const fn = ns ? ns[name] : undefined;
    if (typeof fn !== "function") {
      return;
    }
    try {
      fn();
    } catch (error) {
      console.error(`ck-hasher: ${name} failed`, error);
    }
  };

  /**
   * Stamp the footer and start each page part.
   * @returns {void}
   */
  const boot = () => {
    stampYear();
    stampVersion();
    run("initAddressSearch");
    run("initPriceFeed");
    run("initNetworkFeed");
    run("initPoolFeed");
  };

  /* The script may sit in the head, so wait for the document when the parser
     has not built the page yet. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
