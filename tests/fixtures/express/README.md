# Express source fixture

Read-only upstream source from expressjs/express commit
`a419aa7350389a275ab45fde2e849ed1f02449ef`, downloaded from
`https://raw.githubusercontent.com/expressjs/express/a419aa7350389a275ab45fde2e849ed1f02449ef/<path>`.
Filenames replace slashes with underscores and append .txt. Never execute these files.
Upstream copyright headers and MIT LICENSE.txt are retained.

lib/express.js is 1,636 bytes. Relative requires occur at lines 18, 20 and 21.
The route-map and route-middleware examples directly require ../../lib/express
at lines 8 and 7 respectively. Their relationship to application/request/response
through express.js is indirect.

Citation tests use this exact source, SHA-256
`4f35e8273a5e78c35e778d14e4a8c80a81ca3e1fc8047dc87d2077b860404572`.
Inspected ranges: createApplication implementation 36–56 (request delegation at
38), prototype exports 62–64, Router exports 70–71, middleware exports 77–81.
Mock explanations quote this fixture literally; they are not live model results.

The test helper uses a partial inventory of these six real files, synthetic
metadata-only test-data entries, and simulated HTTP failures. It is an offline
test fixture, not a complete live Express import.
