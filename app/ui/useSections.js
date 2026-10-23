// ../pub-game-store/native/ui/useSections.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED (0.5.0 Pre Release 3): Settings is a section, the last one (after Files), not a screen over the page.

import { useRef, useState } from 'react';
import { NO_FILTERS, activeCount } from '../state/catalog.js';
import { useNavActions, useNavState } from '../state/nav.jsx';
import { useQueryActive, useStoreActions, useStoreState } from '../state/store.jsx';
import { HOMEBREW_ONLY } from '../edition.js';

  var KEYS2 = {
    search: "nav:search",
    discover: "nav:discover",
    catalog: "nav:browse",
    top: "nav:top",
    new: "nav:new",
    homebrew: "nav:homebrew",
    favorites: "nav:favorites",
    downloads: "nav:downloads",
    files: "nav:files",
    settings: "nav:settings"
  };
  // 0.5.1: the homebrew-only edition steps between the Homebrew section and Settings.
  var TABS = HOMEBREW_ONLY ? ["homebrew", "settings"] : ["search", "discover", "top", "new", "homebrew", "favorites", "downloads", "files", "settings"];
  function useShowLibrary() {
    const store = useStoreActions();
    const nav = useNavActions();
    const [show] = (0, useState)(() => (filters, sort, target = "catalog:sort") => {
      store.setFilters(filters);
      store.setQuery("");
      store.setSort(sort);
      nav.home(target);
    });
    return show;
  }
  function sectionOf({ filters, sort }, query) {
    if (filters.wishlist) return "favorites";
    if (sort === "rating") return "top";
    if (sort === "newest") return "new";
    if (activeCount(filters) > 0 || query) return "catalog";
    return "discover";
  }
  function useSections() {
    const store = { ...useStoreState(), ...useStoreActions() };
    const queryActive = useQueryActive();
    const nav = useNavActions();
    const { top } = useNavState();
    const show = useShowLibrary();
    // "storage" (Manage files) is part of the Files section, under its library.
    const underneath = top.name === "downloads" || top.name === "files" || top.name === "homebrew" || top.name === "settings" ? top.name : top.name === "storage" ? "files" : top.name === "homebrew-app" ? "homebrew" : sectionOf(store, queryActive);
    const section = top.name === "search" ? "search" : top.name === "game" ? null : underneath;
    const topName = (0, useRef)(top.name);
    topName.current = top.name;
    const [on] = (0, useState)(() => ({
      show,
      search: () => topName.current !== "search" && nav.push({ name: "search" }, "nav:search"),
      discover: () => show(NO_FILTERS, "relevance", "spotlight:cta"),
      top: () => show(NO_FILTERS, "rating"),
      new: () => show(NO_FILTERS, "newest"),
      favorites: () => show({ ...NO_FILTERS, wishlist: true }, "relevance"),
      downloads: () => topName.current !== "downloads" && nav.push({ name: "downloads" }, "nav:downloads"),
      // The Homebrew section, apart from the store: from one of its app pages it goes back to the section.
      homebrew: () => topName.current === "homebrew-app" ? nav.pop() : topName.current !== "homebrew" && nav.push({ name: "homebrew" }, "nav:homebrew"),
      files: () => topName.current === "storage" ? nav.pop() : topName.current !== "files" && nav.push({ name: "files" }, "nav:files"),
      settings: () => topName.current !== "settings" && nav.push({ name: "settings" }, "nav:settings")
    }));
    const step = (forward) => {
      const current = top.name === "search" ? "search" : underneath;
      const at = current === "catalog" ? 1.5 : TABS.indexOf(current);
      const next = TABS[forward ? Math.floor(at) + 1 : Math.ceil(at) - 1];
      if (!next) return;
      if (next === "downloads" || next === "files" || next === "homebrew" || next === "settings") {
        store.setQuery("");
        nav.home();
      }
      on[next]();
    };
    return {
      section,
      filters: store.filters,
      on,
      step,
      // The page's top elements go up to `nav:current`, the current section's item, like a PS5 tab
      // row; the scope's own memory would be stale after L1/R1 or a closed menu.
      keyOf: (name) => name === section ? "nav:current" : KEYS2[name]
    };
  }

export { useSections, useShowLibrary };
