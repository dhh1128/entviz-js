/**
 * @entviz/react — React components over the certified @entviz/core renderer.
 *
 * Ships raw .ts source (no build step); authored with React.createElement so it
 * carries no JSX-transform requirement onto consumers.
 */
export { Entviz, default as EntvizDefault, type EntvizProps } from "./Entviz.ts";
export { EntvizPill, type EntvizPillProps, type CopyKind } from "./EntvizPill.ts";
export { SUPPORTED_LOCALES, type Messages } from "./pill-messages.ts";
