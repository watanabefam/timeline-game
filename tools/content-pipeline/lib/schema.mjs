// schema.mjs — Ajv (Draft 2020-12) compiled once, strict, allErrors.
// ajv-formats is required or `format: "uri"` is silently a no-op.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = join(here, "..", "schema", "deck.schema.json");
export const REGISTRY_PATH = join(here, "..", "registry", "sources.json");

const ajv = new Ajv2020({ allErrors: true, strict: true, coerceTypes: false });
addFormats(ajv);

export const deckSchema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const validateDeck = ajv.compile(deckSchema);

/** Returns Ajv errors ([] when valid). Compile-once, validate-many. */
export function validateDeckSchema(deck) {
  return validateDeck(deck) ? [] : validateDeck.errors || [];
}

export function loadRegistry(path = REGISTRY_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}
