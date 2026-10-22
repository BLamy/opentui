// Browser entry for the tree-sitter worker. Module evaluation follows import
// order, so the Node globals exist before the worker's dependencies load.
import "./install-globals.js"
import "../lib/tree-sitter/parser.worker.js"
