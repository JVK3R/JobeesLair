// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// npm run dev only: a Babel plugin that rewrites the app's own `useState(init)` (imported from 'react') into
// `useKeptState("<file>::<Component>#<n>", init)` from @ps5-react/core (runtime/js/keep-state.js), so what a
// screen holds survives the preview's restart when a file is saved. Adapted from Embedded React's simulator
// transform (bridges/quickjs/js/persist-transform.mjs, Apache-2.0, Cory Lamming): there each call site is one
// key; here the runtime adds the instance's useId, so each row of a list keeps its own state.
//
// A key names the file, the enclosing function and the order of its useState calls: edits to JSX and logic keep
// it, while adding, removing or reordering a component's useState calls (or renaming it) starts that component
// afresh. The PS5 build and npm test never run this transform.

/** Best-effort name of the function enclosing `path`: the component a useState belongs to. */
function enclosingName(path) {
  const fn = path.getFunctionParent();
  if (!fn) return '_';
  if (fn.node.id?.name) return fn.node.id.name;
  const parent = fn.parentPath?.node;
  if (parent?.type === 'VariableDeclarator' && parent.id?.name) return parent.id.name;
  if (parent?.key?.name) return parent.key.name;
  if (parent?.type === 'AssignmentExpression' && parent.left?.name) return parent.left.name;
  return '_';
}

/** `moduleId`: the file's path in the app, so keys stay the same wherever the app is checked out. */
export default function keepStatePlugin({types: t}) {
  return {
    name: 'ps5-react-keep-state',
    visitor: {
      Program: {
        enter(_path, state) {
          state.counters = new Map();
          state.used = false;
        },
        exit(path, state) {
          if (!state.used) return;
          path.unshiftContainer('body', t.importDeclaration(
            [t.importSpecifier(t.identifier('__ps5KeepState'), t.identifier('useKeptState'))],
            t.stringLiteral('@ps5-react/core')));
        },
      },
      CallExpression(path, state) {
        const callee = path.node.callee;
        // useState(...) from a named import, or React.useState(...) from a namespace or default import.
        const named = t.isIdentifier(callee, {name: 'useState'}) && path.scope.getBinding('useState');
        const member = t.isMemberExpression(callee) && t.isIdentifier(callee.property, {name: 'useState'}) &&
          t.isIdentifier(callee.object) && path.scope.getBinding(callee.object.name);
        const binding = named || member;
        if (!binding || binding.kind !== 'module') return;
        const source = binding.path.parentPath?.node?.source?.value;
        if (source !== 'react') return;
        const name = enclosingName(path);
        const index = state.counters.get(name) ?? 0;
        state.counters.set(name, index + 1);
        path.replaceWith(t.callExpression(t.identifier('__ps5KeepState'),
          [t.stringLiteral(`${state.opts.moduleId}::${name}#${index}`), ...path.node.arguments]));
        state.used = true;
        path.skip();
      },
    },
  };
}
