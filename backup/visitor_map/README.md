# Visitor map backups

Snapshots of the visitor-country counts from the Cloudflare Worker
(https://saltnetmap.yunchuan-wang.workers.dev). Each `visitors_<date>.json` is the
`{ "<ISO2>": count }` aggregate at that date.

## Restore into the Worker KV
Either set the KV key `agg` directly (Cloudflare dashboard → KV → VISITS → edit `agg`)
to the JSON in a snapshot, or replay counts with `POST /hit?cc=XX`.
