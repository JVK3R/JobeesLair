// ../pub-game-store/native/browse/ContinueRow.jsx
// reconstructed from the esbuild bundle in eboot.bin

import '../assets/Exo2.ttf';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { memo } from 'react';
import { GameRail } from './GameRail.jsx';
import { WAITING, shownState, stateLabel } from '../downloads/labels.js';
import { fractionOf, useJobs, useProgress } from '../downloads/useQueue.js';
import { formatPercent2 } from '../i18n/core.js';
import { useT } from '../i18n/index.js';
import { getGame } from '../state/catalog.js';
import { BUSY } from '../state/download-queue.js';
import { useNavActions } from '../state/nav.jsx';
import { GameCard } from '../ui/GameCard.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { ShimmerText } from '../ui/ShimmerText.jsx';
import { Text, View, useIsFocused } from '@ps5-react/core';
import { colors } from '../ui/colors.js';

  var UNFINISHED = [...BUSY, "paused", "failed"];
  var WIDTH2 = 152;
  var STATE = { fontFamily: "Exo2", fontSize: 21 };
  function JobCaption({ job: job2 }) {
    const t2 = useT();
    const focused = useIsFocused();
    const progress = useProgress(job2.id);
    const fraction = fractionOf(progress);
    const shown = shownState(job2);
    const percent = progress?.total && job2.state !== "failed" ? ` \xB7 ${formatPercent2(Math.floor(fraction * 100))}` : "";
    return /* @__PURE__ */ (0, jsxs)(Fragment, { children: [
      /* @__PURE__ */ (0, jsx)(Text, { focused, style: [{ marginTop: 18, width: 225, fontFamily: "Exo2", fontSize: 23, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" }, focused ? { color: colors.fg } : null], children: job2.title }),
      /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 12 }, children: /* @__PURE__ */ (0, jsx)(ProgressBar, { fraction, width: WIDTH2, active: job2.state === "downloading" }) }),
      WAITING.includes(shown) ? /* @__PURE__ */ (0, jsx)(View, { style: { marginTop: 9, width: 225 }, children: /* @__PURE__ */ (0, jsx)(ShimmerText, { textStyle: STATE, children: stateLabel(shown) }) }) : /* @__PURE__ */ (0, jsx)(Text, { style: job2.state === "failed" ? { marginTop: 9, width: 225, fontFamily: "Exo2", fontSize: 21, color: colors.fg, numberOfLines: 1, ellipsizeMode: "tail" } : { marginTop: 9, width: 225, fontFamily: "Exo2", fontSize: 21, color: colors.subtle, numberOfLines: 1, ellipsizeMode: "tail" }, children: job2.state === "failed" ? t2("browse.continueFailed") : `${stateLabel(job2.state)}${percent}` })
    ] });
  }
  var ContinueRow = (0, memo)(function ContinueRow2() {
    const t2 = useT();
    const { jobs } = useJobs();
    const { push, openGame } = useNavActions();
    const entries2 = jobs.filter((job2) => UNFINISHED.includes(job2.state)).map((job2) => ({ job: job2, game: getGame(job2.gameId) })).filter((entry2) => entry2.game);
    if (!entries2.length) return null;
    return /* @__PURE__ */ (0, jsx)(
      GameRail,
      {
        title: t2("browse.continueDownloading"),
        seeAllKey: "continue:all",
        onSeeAll: () => push({ name: "downloads" }, "continue:all"),
        children: entries2.map(({ job: job2, game }, index) => {
          const key = `continue:${job2.id}`;
          return /* @__PURE__ */ (0, jsx)(
            GameCard,
            {
              game,
              width: WIDTH2,
              detailed: true,
              focusKey: key,
              rowEnd: index === entries2.length - 1,
              onPress: () => openGame(game.id, key),
              caption: /* @__PURE__ */ (0, jsx)(JobCaption, { job: job2 })
            },
            job2.id
          );
        })
      }
    );
  });

export { ContinueRow };
