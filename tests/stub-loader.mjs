// Loaded with node --import (see package.json): modules that import 'react' or '@ps5-react/core' only for their hooks
// and runtime objects load under plain Node; the stubs do nothing.
import { register } from 'node:module';

const stub = `
export const useState = (value) => [typeof value === 'function' ? value() : value, () => {}];
export const useEffect = () => {};
export const useMemo = (make) => make();
export const useRef = (value) => ({ current: value });
export const useLayoutEffect = () => {};
export const useCallback = (fn) => fn;
export const createContext = () => ({});
export const useContext = () => ({});
export const memo = (component) => component;
// A test may put files behind FileSystem (globalThis.__stubFiles, a Map of path to text) and a console keyboard behind
// Keyboard (globalThis.__stubKeyboard: {available, open(options)}); without them, nothing is there.
export const FileSystem = {
  dataDir: '/download0',
  exists: (path) => globalThis.__stubFiles?.has(path) ?? false,
  readFile: (path) => globalThis.__stubFiles?.get(path) ?? '',
  writeFile(path, text) { globalThis.__stubFiles?.set(path, String(text)); },
  mkdir() {},
  rename(from, to) { const files = globalThis.__stubFiles; if (files?.has(from)) { files.set(to, files.get(from)); files.delete(from); } },
  stat: () => null,
  readDir: () => []
};
export const Keyboard = {
  get available() { return globalThis.__stubKeyboard?.available ?? false; },
  get isOpen() { return globalThis.__stubKeyboard?.isOpen ?? false; },
  open: (options) => globalThis.__stubKeyboard.open(options),
  close() { globalThis.__stubKeyboard?.close?.(); }
};
export const Platform = { OS: 'desktop' };
export const setLightMotion = () => {};
export const Http = {};
export const Image = { warm() {}, prefetch: () => Promise.resolve(), setRouter() {} };
export const Downloads = {};
export const Payloads = { send: () => ({ ok: false, error: 'stub' }) };
export const LocalServer = { token() { throw new Error('no server here'); } };
export const DeviceInfo = { utcOffset: () => 0, get: () => ({}) };
export default {};
`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'react' || specifier === '@ps5-react/core') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(specifier, context);
}`)}`);
