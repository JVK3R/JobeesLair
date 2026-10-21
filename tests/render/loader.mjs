// Loaded with node --import (see package.json): loads the app's screens under plain Node for a render smoke test.
// React's hooks, the JSX runtime and @ps5-react/core become small stand-ins; font and image imports
// become empty modules, JSON a default export; the queue, the drives and the download modules the
// screens read are replaced by fakes that read globalThis.__fake.
import { register } from 'node:module';

const react = `
export const useState = (value) => [typeof value === 'function' ? value() : value, () => {}];
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const useMemo = (make) => make();
export const useCallback = (fn) => fn;
export const useRef = (value) => ({ current: value });
export const memo = (component) => component;
export const createContext = (value) => ({ value });
export const useContext = (context) => context?.value ?? new Proxy({}, { get: () => () => {} });
export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
export default {};
`;
const jsx = `
export const jsx = (type, props, key) => ({ type, props, key });
export const jsxs = jsx;
export const Fragment = 'Fragment';
`;
const core = `
const fs = () => globalThis.__fake?.fs ?? { exists: () => false, stat: () => null, readDir: () => [], readFile: () => '' };
export const FileSystem = new Proxy({ dataDir: '/download0', appDir: '/app0' }, { get: (target, key) => key in target ? target[key] : (...args) => fs()[key]?.(...args) });
export const Platform = { get OS() { return globalThis.__fake?.os ?? 'desktop'; }, select: (spec) => spec.desktop ?? spec.default };
export const SelfUpdate = { arm: (dir) => (globalThis.__fake?.arms?.push(dir), globalThis.__fake?.armResult ?? true) };
export const BackHandler = { exitApp: () => globalThis.__fake?.exits?.push(true), addEventListener: () => ({ remove() {} }) };
export const DeviceInfo = { utcOffset: () => 0, get: () => ({ language: 'en-US' }) };
export const Fonts = { setLanguage() {} };
export const Http = {};
export const Downloads = {};
export const DownloadFormats = { images: ['exfat', 'ffpfs', 'ffpfsc', 'ffpkg'] };
for (const name of ['View', 'Text', 'Image', 'ScrollView', 'FocusScope', 'Svg', 'Path', 'AnimatePresence', 'Circle', 'Rect', 'G']) globalThis['__c' + name] = name;
export const View = 'View', Text = 'Text', Image = 'Image', ScrollView = 'ScrollView', FocusScope = 'FocusScope', Svg = 'Svg', Path = 'Path', AnimatePresence = 'AnimatePresence';
export const motion = { View: 'motion.View', Text: 'motion.Text' };
export const useIsFocused = () => globalThis.__fake?.focused ?? true;
export const useFocusActions = () => ({ focus() {}, blur() {} });
export const Controller = { setLightBar() {}, resetLightBar() {} };
export const AppRegistry = {}, Archives = {}, LayoutAnimation = {}, Linking = {}, LocalServer = {}, Notifications = { show() {} }, Packages = {}, Payloads = { send: () => ({ ok: false, error: 'desktop' }) }, Power = {}, Sound = {}, Users = {}, transitions = {};
export const VirtualList = 'VirtualList', ReleaseImages = 'ReleaseImages';
export const useFocus = () => ({});
export const useNavigationEvents = () => {};
export default {};
`;
const fakes = {
  '/downloads/useQueue.js': `
export const useJobs = () => ({ jobs: globalThis.__fake.jobs });
export const fractionOf = (job) => job?.total ? job.written / job.total : 0;
export const useQueue = () => ({ jobs: globalThis.__fake.jobs });`,
  '/state/drives.js': `
export const useDrives = () => globalThis.__fake.drives;
export const refreshDrives = async () => {};
export const driveSnapshot = () => globalThis.__fake.drives;
export const storageRoots = () => globalThis.__fake.drives.roots;
export const freeBytes = (root) => globalThis.__fake.drives.usage[root]?.free ?? null;`,
  '/state/downloads.js': `
export const downloadQueue = () => globalThis.__fake.queue;
export const storageRoots = () => globalThis.__fake.drives.roots;
export const freeBytes = (root) => globalThis.__fake.drives.usage[root]?.free ?? null;
export const shadowMountUp = async () => true;
export function driveName(root) {
  if (root === '/data') return 'Internal storage';
  const mount = /^\\/mnt\\/(usb|ext)(\\d+)$/.exec(root);
  return mount ? (mount[1] === 'usb' ? 'USB drive ' : 'Extended storage ') + (Number(mount[2]) + 1) : 'This device';
}`,
};
const url = (source) => 'data:text/javascript,' + encodeURIComponent(source);
register(url(`
const urls = ${JSON.stringify({ react: url(react), 'react/jsx-runtime': url(jsx), '@ps5-react/core': url(core) })};
const fakes = ${JSON.stringify(Object.fromEntries(Object.entries(fakes).map(([key, source]) => [key, url(source)])))};
export async function resolve(specifier, context, next) {
  if (urls[specifier]) return { url: urls[specifier], shortCircuit: true };
  const found = await next(specifier, context);
  for (const [suffix, fake] of Object.entries(fakes)) if (found.url.endsWith(suffix)) return { url: fake, shortCircuit: true };
  return found;
}
export async function load(href, context, next) {
  if (/\\.(ttf|otf|png|jpg|webp|svg|wav)$/.test(href)) return { format: 'module', source: 'export default "";', shortCircuit: true };
  if (href.endsWith('.jsx')) {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    return { format: 'module', source: readFileSync(fileURLToPath(href), 'utf8'), shortCircuit: true };
  }
  if (href.endsWith('.json')) {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    return { format: 'module', source: 'export default ' + readFileSync(fileURLToPath(href), 'utf8') + ';', shortCircuit: true };
  }
  return next(href, context);
}`));
