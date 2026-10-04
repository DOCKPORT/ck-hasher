/**
 * @file The Bitcoin address search. It reads the address field, checks the
 * shape of the value, and reports the result. The lookup against the ck-pool
 * arrives in a later step, so this module reports the accepted address only.
 * The page has no build step, so this file adds one function to the shared
 * namespace from js/version.js. Load js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /**
   * A legacy address (base58, prefix 1 or 3) or a bech32 address (prefix bc1).
   * The test is a shape check, not a checksum check. The ck-pool verifies the
   * address on the lookup.
   */
  const ADDRESS_PATTERN =
    /^(bc1[a-z0-9]{25,89}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

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
   * Wire the address search form. A submit reads the field and reports the
   * result in the status line.
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

      setStatus(status, `Looking up the miner for ${address}...`, "info");
    });
  };
})();
