// The app's HTTP/SOCKS proxy (Settings, Downloads). The native transport is process-wide (Http.setProxy,
// ps5-react ABI v25), so one address carries every request the app makes: downloads, catalog feeds, cover
// art, update checks and the players' numbers. Kept in settings.json beside the other settings and handed
// to the transport before the first request at launch, and at once when it changes.
//
// Accepted: http://host:port, https://host:port, socks5://host:port, socks5h://host:port (names resolved
// at the proxy), with user:pass@ before the host for basic authentication. Empty turns it off. A bare
// host:port is read as http; anything else is refused with a sentence the dialog shows.

import { useEffect, useState } from 'react';
import { Http } from '@ps5-react/core';
import { loadList, saveList } from './saved.js';
import { log } from '../services/logger.js';

  var SETTINGS = "settings.json";
  var PATTERN = /^(https?|socks5h?):\/\/(?:([^:@\/\s]+)(?::([^@\/\s]*))?@)?(\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?)(?::(\d{1,5}))?\/?$/i;
  var SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
  var BAD = "That isn't a proxy address. Use http://host:port, or socks5h://host:port.";
  // host:port of an accepted address, without anything else: what the settings row says and the log keeps.
  function proxyHost(proxy) {
    const match = /^[a-z0-9+.-]+:\/\/(?:[^@\/]*@)?(\[[^\]]+\]|[^:\/]+)(?::(\d+))?\/?$/i.exec(String(proxy ?? ""));
    return match ? match[1] + (match[2] ? `:${match[2]}` : "") : "";
  }
  /** The address as the transport takes it, or "" for none. Throws a sentence for anything malformed. */
  function normalizeProxy(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const url = SCHEME.test(text) ? text : `http://${text}`;
    const match = PATTERN.exec(url);
    if (!match) throw new Error(BAD);
    const scheme = match[1].toLowerCase();
    const host = match[4].toLowerCase();
    const port = match[5];
    if (port !== void 0 && (Number(port) < 1 || Number(port) > 65535)) throw new Error("The proxy's port must be between 1 and 65535.");
    const auth = match[2] === void 0 ? "" : `${match[2]}:${match[3] ?? ""}@`;
    return `${scheme}://${auth}${host}${port === void 0 ? "" : `:${port}`}`;
  }
  var saved = null;
  // The saved proxy, read once; a value the app no longer accepts counts as off.
  function proxyNow() {
    if (saved === null) {
      try {
        saved = normalizeProxy(loadList(SETTINGS, "settings").proxy);
      } catch (error) {
        saved = "";
        console.log(`[proxy] saved address ignored: ${error.message}`);
      }
    }
    return saved;
  }
  function applyProxy() {
    try {
      Http.setProxy?.(proxyNow());
      const proxy = proxyNow();
      log("proxy", proxy ? `every request through ${proxyHost(proxy)}` : "every request direct");
    } catch (error) {
      console.log(`[proxy] not applied: ${error.message}`);
    }
  }
  var listeners = /* @__PURE__ */ new Set();
  /** Sets the proxy ("" turns it off), saves it and applies it at once; throws for a malformed address. */
  function setProxy(value) {
    const proxy = normalizeProxy(value);
    saved = proxy;
    const settings = loadList(SETTINGS, "settings");
    if (proxy) settings.proxy = proxy;
    else delete settings.proxy;
    saveList(SETTINGS, "settings", settings);
    applyProxy();
    for (const listener of listeners) listener(proxy);
    return proxy;
  }
  function useProxy() {
    const [proxy, setCurrent] = (0, useState)(proxyNow);
    (0, useEffect)(() => {
      listeners.add(setCurrent);
      setCurrent(proxyNow());
      return () => {
        listeners.delete(setCurrent);
      };
    }, []);
    return proxy;
  }

export { applyProxy, normalizeProxy, proxyHost, proxyNow, setProxy, useProxy };
