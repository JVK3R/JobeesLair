// ../pub-game-store/native/ui/useSections.js
// reconstructed from the esbuild bundle in eboot.bin
// MODIFIED (0.5.0 Pre Release 3): Settings is a section, the last one (after Files), not a screen over the page.
// MODIFIED (0.5.2): Browse is a section L1 and R1 step to (ui/sections.js, where the order and the rules are).

import { useRef, useState } from 'react';
import { NO_FILTERS } from '../state/catalog.js';
import { useNavActions, useNavState } from '../state/nav.jsx';
import { useQueryActive, useStoreActions, useStoreState } from '../state/store.jsx';
import { BROWSE_SORT, sectionOf, stepFrom } from './sections.js';

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
      // 0.5.2: Browse, the whole catalog A to Z (its menu's "All games", and L1/R1).
      catalog: () => show(NO_FILTERS, BROWSE_SORT),
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
      const next = stepFrom(top.name === "search" ? "search" : underneath, forward);
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
