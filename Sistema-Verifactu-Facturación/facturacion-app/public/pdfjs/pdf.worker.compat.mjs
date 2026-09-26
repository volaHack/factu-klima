// El worker de pdf.js con el polyfill delante: los import se evalúan en
// orden, así que cuando pdf.js arranca, Map ya tiene lo que necesita.
import './mapa-polyfill.mjs';
import './pdf.worker.min.mjs';
