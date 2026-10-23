/**
 * Builds DOM nodes from data without HTML strings. Strings always become text nodes, so session
 * text can never turn into markup. Use innerHTML only for fixed templates without data.
 */
type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  /** Plain attributes (aria-*, role, …). */
  attrs?: Record<string, string>;
  data?: Record<string, string>;
  /** CSS custom properties, set through the CSSOM (allowed by the style-src policy). */
  vars?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, v] of Object.entries(props.data ?? {})) el.dataset[k] = v;
  for (const [k, v] of Object.entries(props.vars ?? {})) el.style.setProperty(`--${k}`, v);
  for (const child of children) if (child) el.append(child);
  return el;
}
