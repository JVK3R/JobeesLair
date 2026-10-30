// Typing from the phone (0.5.4): a box on the console that asks for text (downloads/URLDialog.jsx: a catalog feed, a
// mirror, a debrid key, a download's file link; the Search page) says so here while it is open, and the phone
// companion shows it with a field of its own (companion/api.js /api/typing). What the phone sends is that box's
// answer, as if typed on the console. The newest box open is the one asked; when it closes, the one under it is again.
// The PS5 keyboard, when it is up for the box, is closed first (state/system-keyboard.js closeForPhone).

  var MAX_TEXT = 2048;
  var open = [];
  var made = 0;
  var listeners = /* @__PURE__ */ new Set();
  var told = () => {
    for (const listener of listeners) {
      try {
        listener(phoneAsking());
      } catch (error) {
        console.log(`[phone-typing] a listener failed: ${error?.message}`);
      }
    }
  };
  /**
   * Opens a box to the phone: `title` and `detail` as the console shows them, `kind` "url" | "key" | "search", and
   * `answer(text)`, which takes the phone's text and returns why it was refused ("" when it was taken). Returns the
   * function that closes it again.
   */
  function askPhone({ title, detail = "", kind = "url", answer }) {
    const entry = { id: `t${++made}`, title: String(title || ""), detail: String(detail || ""), kind, answer };
    open.push(entry);
    told();
    return () => {
      const at = open.indexOf(entry);
      if (at < 0) return;
      open.splice(at, 1);
      told();
    };
  }
  /** The box the phone may answer now: { id, title, detail, kind }, or null. */
  function phoneAsking() {
    const top = open[open.length - 1];
    return top ? { id: top.id, title: top.title, detail: top.detail, kind: top.kind } : null;
  }
  /**
   * The phone's answer to box `id`: "" when the box took it, else why not. Throws when that box is no longer the
   * one asking (closed, or another opened over it).
   */
  function answerFromPhone(id, text) {
    const top = open[open.length - 1];
    if (!top || top.id !== id) throw new Error("The console isn't asking for that any more.");
    return String(top.answer(String(text ?? "").slice(0, MAX_TEXT)) || "");
  }
  /** Hears each change of the box asking (its value, or null). Returns the function that stops it. */
  function onPhoneAsking(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

export { MAX_TEXT, answerFromPhone, askPhone, onPhoneAsking, phoneAsking };
