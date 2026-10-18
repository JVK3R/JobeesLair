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
export const FileSystem = { dataDir: '/download0', exists: () => false, readFile: () => '', writeFile() {}, mkdir() {}, rename() {}, stat: () => null, readDir: () => [] };
export const Platform = { OS: 'desktop' };
export const Http = {};
export const Downloads = {};
export const DeviceInfo = { utcOffset: () => 0, get: () => ({}) };
export default {};
`;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'react' || specifier === '@ps5-react/core') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(specifier, context);
}`)}`);
